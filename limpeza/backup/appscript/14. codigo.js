/**
 * ==============================================================================
 * CENTRAL DE TAREFAS - GOOGLE APPS SCRIPT (OTIMIZADO E COM ESQUEMA)
 * ==============================================================================
 */

/**
 * Retorna o esquema estrutural completo da planilha (Abas, Cabeçalhos e Tipos)
 */
function obterEsquemaPlanilha() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abas = ss.getSheets();
  let esquema = [];

  abas.forEach(aba => {
    let nomeAba = aba.getName();
    let ultimaLinha = aba.getLastRow();
    let ultimaColuna = aba.getLastColumn();
    
    let cabecalhos = [];
    let tiposDados = [];

    if (ultimaColuna > 0) {
      cabecalhos = aba.getRange(1, 1, 1, ultimaColuna).getValues()[0];
      
      if (ultimaLinha > 1) {
        // Amostra da linha 2 para inferir tipos de dados
        let amostra = aba.getRange(2, 1, Math.min(ultimaLinha - 1, 5), ultimaColuna).getValues();
        
        for (let c = 0; c < ultimaColuna; c++) {
          let tipoInferido = "Texto";
          for (let r = 0; r < amostra.length; r++) {
            let val = amostra[r][c];
            if (typeof val === "number") {
              tipoInferido = "Número";
              break;
            } else if (val instanceof Date) {
              tipoInferido = "Data/Hora";
              break;
            }
          }
          tiposDados.push(tipoInferido);
        }
      } else {
        cabecalhos.forEach(() => tiposDados.push("Vazio"));
      }
    }

    esquema.push({
      nomeAba: nomeAba,
      totalLinhas: ultimaLinha,
      totalColunas: ultimaColuna,
      colunas: cabecalhos.map((col, index) => ({
        posicao: index + 1,
        cabecalho: col || `Coluna ${index + 1}`,
        tipoDetectado: tiposDados[index] || "Desconhecido"
      }))
    });
  });

  return esquema;
}

/**
 * COMUNICAÇÃO WEB - GET (Lê dados ou o esquema estrutural)
 */
function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    // Se a requisição pedir o esquema estrutural da planilha
    if (params.acao === "esquema") {
      const esquema = obterEsquemaPlanilha();
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        esquema: esquema
      })).setMimeType(ContentService.MimeType.JSON);
    }

    let abaProgresso = ss.getSheetByName("Progresso Diário");
    let abaPonto = ss.getSheetByName("Registro de Ponto");

    if (!abaProgresso) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Aba Progresso Diário não encontrada." })).setMimeType(ContentService.MimeType.JSON);
    }

    const dadosProgresso = abaProgresso.getDataRange().getValues();
    dadosProgresso.shift();

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

/**
 * COMUNICAÇÃO WEB - POST (Ações do site)
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Payload vazio." })).setMimeType(ContentService.MimeType.JSON);
    }

    const conteudo = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let abaProgresso = ss.getSheetByName("Progresso Diário");
    let abaPonto = ss.getSheetByName("Registro de Ponto");
    let abaMissoes = ss.getSheetByName("Missões");

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
      
      if (abaMissoes) {
        abaMissoes.appendRow([proximoId, conteudo.titulo, conteudo.comodo, conteudo.tempoEstimado, conteudo.prioridade]);
      }

      abaProgresso.getRange(abaProgresso.getLastRow(), 1).setNumberFormat("0");

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