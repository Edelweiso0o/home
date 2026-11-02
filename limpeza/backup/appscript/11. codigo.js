/**
 * ==============================================================================
 * CENTRAL DE TAREFAS - GOOGLE APPS SCRIPT (SIMPLIFICADO E DIRETO)
 * ==============================================================================
 */

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let abaProgresso = ss.getSheetByName("Progresso Diário");
    let abaPonto = ss.getSheetByName("Registro de Ponto");

    // Se as abas não existirem, cria automaticamente com a estrutura limpa
    if (!abaProgresso || !abaPonto) {
      criarAbasIniciais(ss);
      abaProgresso = ss.getSheetByName("Progresso Diário");
      abaPonto = ss.getSheetByName("Registro de Ponto");
    }

    const dadosProgresso = abaProgresso.getDataRange().getValues();
    dadosProgresso.shift(); // remove cabeçalho

    const missoes = dadosProgresso.map(linha => {
      let statusClean = String(linha[5] || 'Pendente').trim();
      return {
        id: Number(linha[0]),
        titulo: linha[1],
        comodo: linha[2],
        tempoEstimado: Number(linha[3]),
        prioridade: linha[4],
        status: statusClean,
        horaInicio: String(linha[6] || ''),
        horaTermino: String(linha[7] || ''),
        estadoMissao: statusClean === 'Concluído' ? 'Concluído' : (statusClean === 'Em Andamento' ? 'EmAndamento' : 'Pendente')
      };
    }).filter(m => m.id !== "" && !isNaN(m.id));

    let turnos = [];
    if (abaPonto && abaPonto.getLastRow() > 1) {
      const dadosPonto = abaPonto.getDataRange().getValues();
      dadosPonto.shift();
      turnos = dadosPonto.map(linha => {
        let dataFormatada = linha[1];
        if (dataFormatada instanceof Date) {
          dataFormatada = Utilities.formatDate(dataFormatada, Session.getScriptTimeZone(), "dd/MM/yyyy");
        } else {
          dataFormatada = String(dataFormatada || '');
        }

        return {
          id: Number(linha[0]),
          data: dataFormatada || "",
          entrada: linha[2] ? String(linha[2]).trim() : "",
          saida: linha[3] ? String(linha[3]).trim() : "",
          duracao: linha[4] !== "" && !isNaN(linha[4]) ? Number(linha[4]) : "",
          status: String(linha[7] || "").trim()
        };
      }).filter(t => t.id !== "" && !isNaN(t.id));
    }

    let totalConcluidas = missoes.filter(m => m.status === 'Concluído').length;

    return ContentService.createTextOutput(JSON.stringify({ 
      status: "success", 
      missoes: missoes, 
      turnos: turnos,
      estatisticas: { concluidas: totalConcluidas, totalSegundos: 0 }
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Payload vazio." })).setMimeType(ContentService.MimeType.JSON);
    }

    const conteudo = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let abaProgresso = ss.getSheetByName("Progresso Diário");
    let abaPonto = ss.getSheetByName("Registro de Ponto");

    if (!abaProgresso || !abaPonto) {
      criarAbasIniciais(ss);
      abaProgresso = ss.getSheetByName("Progresso Diário");
      abaPonto = ss.getSheetByName("Registro de Ponto");
    }

    if (conteudo.acao === "adicionarMissao" || conteudo.acao === "cadastrar") {
      let proximoId = 1000;
      let todosIds = [];
      
      if (abaProgresso && abaProgresso.getLastRow() > 1) {
        let vals = abaProgresso.getRange(2, 1, abaProgresso.getLastRow() - 1, 1).getValues();
        vals.forEach(r => { let n = parseInt(r[0], 10); if(!isNaN(n)) todosIds.push(n); });
      }

      if (todosIds.length > 0) {
        proximoId = Math.max(...todosIds) + 1;
      }

      abaProgresso.appendRow([proximoId, conteudo.titulo, conteudo.comodo, conteudo.tempoEstimado, conteudo.prioridade, "Pendente", "", ""]);
      
      const ultima = abaProgresso.getLastRow();
      abaProgresso.getRange(ultima, 1).setNumberFormat("0");

      return ContentService.createTextOutput(JSON.stringify({ status: "success", id: proximoId })).setMimeType(ContentService.MimeType.JSON);
    }

    if (conteudo.acao === "editarMissao") {
      const dados = abaProgresso.getDataRange().getValues();
      for (let i = 1; i < dados.length; i++) {
        if (String(dados[i][0]) === String(conteudo.id)) {
          abaProgresso.getRange(i + 1, 2).setValue(conteudo.titulo);
          abaProgresso.getRange(i + 1, 3).setValue(conteudo.comodo);
          abaProgresso.getRange(i + 1, 4).setValue(conteudo.tempoEstimado);
          abaProgresso.getRange(i + 1, 5).setValue(conteudo.prioridade);
          break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (conteudo.acao === "atualizarEstadoMissao") {
      const dados = abaProgresso.getDataRange().getValues();
      const horaInicioStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm:ss");

      for (let i = 1; i < dados.length; i++) {
        if (String(dados[i][0]) === String(conteudo.id)) {
          if (conteudo.estadoMissao === 'EmAndamento') {
            abaProgresso.getRange(i + 1, 6).setValue("Em Andamento");
            if (!dados[i][6]) {
              abaProgresso.getRange(i + 1, 7).setNumberFormat("@").setValue(horaInicioStr);
            }
          }
          break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (conteudo.acao === "concluirMissao") {
      const dados = abaProgresso.getDataRange().getValues();
      const horaTerminoStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm:ss");

      for (let i = 1; i < dados.length; i++) {
        if (String(dados[i][0]) === String(conteudo.id)) {
          abaProgresso.getRange(i + 1, 6).setValue("Concluído");
          if (!dados[i][6]) {
            abaProgresso.getRange(i + 1, 7).setNumberFormat("@").setValue(horaTerminoStr);
          }
          abaProgresso.getRange(i + 1, 8).setNumberFormat("@").setValue(horaTerminoStr);
          break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (conteudo.acao === "excluirMissao") {
      const dados = abaProgresso.getDataRange().getValues();
      for (let i = 1; i < dados.length; i++) {
        if (String(dados[i][0]) === String(conteudo.id)) {
          abaProgresso.deleteRow(i + 1);
          break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (conteudo.acao === "baterPonto") {
      if (conteudo.status === "ENTRADA") {
        const ultimaLinha = abaPonto.getLastRow();
        let proximoId = 1000;
        if (ultimaLinha > 1) {
          const ultimoId = abaPonto.getRange(ultimaLinha, 1).getValue();
          proximoId = !isNaN(ultimoId) && ultimoId !== "" ? Number(ultimoId) + 1 : 1000;
        }

        const dataAtual = new Date();
        const dataApenasData = Utilities.formatDate(dataAtual, Session.getScriptTimeZone(), "dd/MM/yyyy");
        const horaEntradaStr = Utilities.formatDate(dataAtual, Session.getScriptTimeZone(), "HH:mm:ss");

        abaPonto.appendRow([proximoId, dataApenasData, horaEntradaStr, "", "", "", "", "Em Serviço"]);
        const lIndex = abaPonto.getLastRow();
        abaPonto.getRange(lIndex, 1).setNumberFormat("0");
        abaPonto.getRange(lIndex, 2).setNumberFormat("@");
        abaPonto.getRange(lIndex, 3).setNumberFormat("@");
      } else if (conteudo.status === "SAIDA") {
        const dados = abaPonto.getDataRange().getValues();
        for (let i = dados.length - 1; i >= 1; i--) {
          if (String(dados[i][7]).trim() === "Em Serviço") {
            const linha = i + 1;
            const minutos = Math.round((conteudo.duracaoSegundos || 0) / 60);
            const horaSaidaStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm:ss");

            abaPonto.getRange(linha, 4).setNumberFormat("@").setValue(horaSaidaStr);
            abaPonto.getRange(linha, 5).setNumberFormat("0").setValue(minutos);
            abaPonto.getRange(linha, 6).setNumberFormat("0,00").setValue(`=E${linha}/60`);
            abaPonto.getRange(linha, 7).setNumberFormat("0,00").setValue(`=E${linha}*0,5`);
            abaPonto.getRange(linha, 8).setValue("Encerrado");
            break;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (conteudo.acao === "excluirLote") {
      const tipo = conteudo.tipo;
      const idsParaExcluir = (conteudo.ids || []).map(id => String(id));

      if (tipo === "progresso") {
        const dados = abaProgresso.getDataRange().getValues();
        for (let i = dados.length - 1; i >= 1; i--) {
          if (idsParaExcluir.includes(String(dados[i][0]))) {
            abaProgresso.deleteRow(i + 1);
          }
        }
      } else if (tipo === "turnos") {
        const dados = abaPonto.getDataRange().getValues();
        for (let i = dados.length - 1; i >= 1; i--) {
          if (idsParaExcluir.includes(String(dados[i][0]))) {
            abaPonto.deleteRow(i + 1);
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (conteudo.acao === "limparDados") {
      const escopo = conteudo.escopo;
      if (escopo === "progresso" || escopo === "tudo") {
        if (abaProgresso && abaProgresso.getLastRow() > 1) {
          abaProgresso.getRange(2, 1, abaProgresso.getLastRow() - 1, abaProgresso.getLastColumn()).clearContent();
        }
      }
      if (escopo === "ponto" || escopo === "tudo") {
        if (abaPonto && abaPonto.getLastRow() > 1) {
          abaPonto.getRange(2, 1, abaPonto.getLastRow() - 1, abaPonto.getLastColumn()).clearContent();
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Ação não reconhecida." })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function criarAbasIniciais(ss) {
  const COR_ROXO = "#231a42";
  
  let abaProgresso = ss.getSheetByName("Progresso Diário");
  if (!abaProgresso) {
    abaProgresso = ss.insertSheet("Progresso Diário");
    abaProgresso.getRange("A1:H1").setValues([["ID", "Título da Missão", "Cômodo", "Tempo Est. (min)", "Prioridade", "Status", "Hora de Início", "Hora de Término"]]);
    abaProgresso.getRange("A1:H1").setBackground(COR_ROXO).setFontColor("#ffffff").setFontWeight("bold");
    
    const inicial = [
      [1000, "Lavar louça e limpar balcão", "Cozinha", 20, "Alta", "Pendente", "", ""],
      [1001, "Higienizar vaso e pia", "Banheiro", 30, "Alta", "Pendente", "", ""],
      [1002, "Tirar o lixo da casa", "Quarto", 10, "Média", "Pendente", "", ""]
    ];
    abaProgresso.getRange(2, 1, inicial.length, 8).setValues(inicial);
  }

  let abaPonto = ss.getSheetByName("Registro de Ponto");
  if (!abaPonto) {
    abaPonto = ss.insertSheet("Registro de Ponto");
    abaPonto.getRange("A1:H1").setValues([["ID Turno", "Data", "Hora Entrada", "Hora Saída", "Duração (Minutos)", "Tempo Trabalhado (Horas)", "Créditos de Descanso (Min)", "Status do Turno"]]);
    abaPonto.getRange("A1:H1").setBackground(COR_ROXO).setFontColor("#ffffff").setFontWeight("bold");
  }
}