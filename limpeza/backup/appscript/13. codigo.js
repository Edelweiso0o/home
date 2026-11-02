/**
 * ==============================================================================
 * CENTRAL DE TAREFAS - GOOGLE APPS SCRIPT (MIGRAÇÃO E IDS UNIFICADOS)
 * ==============================================================================
 */

/**
 * FUNÇÃO DE MIGRAÇÃO MANUAL (Dispare esta função no Apps Script)
 * Ela pega os dados da aba "Missões", reorganiza os IDs de forma sequencial (1000, 1001...),
 * cria/atualiza a aba "Progresso Diário" trazendo título, cômodo, tempo, prioridade,
 * e inicializa Status ("Pendente"), Hora de Início e Hora de Término.
 */
function dispararMudancasManuais() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const COR_ROXO = "#231a42";
  const COR_TEXTO = "#ffffff";

  let abaMissoes = ss.getSheetByName("Missões");
  let abaProgresso = ss.getSheetByName("Progresso Diário");

  if (!abaMissoes) {
    throw new Error("A aba 'Missões' não existe!");
  }

  // 1. Lê todos os dados da aba Missões (Modelo Mestre)
  const lastRowMissoes = abaMissoes.getLastRow();
  let dadosMestre = [];
  
  if (lastRowMissoes > 1) {
    dadosMestre = abaMissoes.getRange(2, 1, lastRowMissoes - 1, Math.min(abaMissoes.getLastColumn(), 5)).getValues();
  } else {
    // Se estiver vazia, cria dados base
    dadosMestre = [
      [1000, "Lavar louça e limpar balcão", "Cozinha", 20, "Alta"],
      [1001, "Higienizar vaso e pia", "Banheiro", 30, "Alta"],
      [1002, "Tirar o lixo da casa", "Quarto", 10, "Média"],
      [1003, "Aspirar e passar pano na sala", "Sala", 25, "Média"],
      [1004, "Organizar corredor", "Corredor", 15, "Baixa"],
      [1005, "Lavar roupas", "Lavanderia", 40, "Média"],
      [1006, "Limpar quintal", "Quintal", 30, "Baixa"]
    ];
  }

  // 2. Reatribui IDs sequenciais limpos (1000, 1001, 1002...) tanto na aba Missões quanto na Progresso Diário
  let idAtual = 1000;
  let dadosMissoesAjustados = [];
  let dadosProgressoNovos = [];

  dadosMestre.forEach(linha => {
    let titulo = linha[1] !== undefined && linha[1] !== "" ? linha[1] : (linha[0] || "Missão Sem Título");
    let comodo = linha[2] || "Cozinha";
    let tempoEst = !isNaN(linha[3]) && linha[3] !== "" ? Number(linha[3]) : 15;
    let prioridade = linha[4] || "Média";

    // Se a linha antiga já tinha status/horários preservados no mestre (caso existam)
    let status = linha[5] || "Pendente";
    let horaInicio = linha[6] || "";
    let horaTermino = linha[7] || "";

    dadosMissoesAjustados.push([idAtual, titulo, comodo, tempoEst, prioridade]);
    dadosProgressoNovos.push([idAtual, titulo, comodo, tempoEst, prioridade, status, horaInicio, horaTermino]);

    idAtual++;
  });

  // 3. Reescreve a aba Missões limpa com os IDs ajustados
  abaMissoes.clear();
  abaMissoes.getRange("A1:E1").setValues([["ID", "Título da Missão", "Cômodo", "Tempo Est. (min)", "Prioridade"]]);
  abaMissoes.getRange("A1:E1").setBackground(COR_ROXO).setFontColor(COR_TEXTO).setFontWeight("bold");
  if (dadosMissoesAjustados.length > 0) {
    abaMissoes.getRange(2, 1, dadosMissoesAjustados.length, 5).setValues(dadosMissoesAjustados);
  }
  abaMissoes.getRange("A2:A500").setNumberFormat("0");

  // 4. Cria/Reescreve a aba Progresso Diário puxando da Missões com Status, Início e Fim
  if (!abaProgresso) {
    abaProgresso = ss.insertSheet("Progresso Diário");
  } else {
    abaProgresso.clear();
  }

  abaProgresso.getRange("A1:H1").setValues([["ID", "Título da Missão", "Cômodo", "Tempo Est. (min)", "Prioridade", "Status", "Hora de Início", "Hora de Término"]]);
  abaProgresso.getRange("A1:H1").setBackground(COR_ROXO).setFontColor(COR_TEXTO).setFontWeight("bold");

  if (dadosProgressoNovos.length > 0) {
    abaProgresso.getRange(2, 1, dadosProgressoNovos.length, 8).setValues(dadosProgressoNovos);
  }

  abaProgresso.getRange("A2:A500").setNumberFormat("0");
  abaProgresso.getRange("G2:H500").setNumberFormat("@");

  // 5. Garante a aba de Ponto
  let abaPonto = ss.getSheetByName("Registro de Ponto");
  if (!abaPonto) {
    abaPonto = ss.insertSheet("Registro de Ponto");
    abaPonto.getRange("A1:H1").setValues([["ID Turno", "Data", "Hora Entrada", "Hora Saída", "Duração (Minutos)", "Tempo Trabalhado (Horas)", "Créditos de Descanso (Min)", "Status do Turno"]]);
    abaPonto.getRange("A1:H1").setBackground(COR_ROXO).setFontColor(COR_TEXTO).setFontWeight("bold");
  }

  SpreadsheetApp.getUi().alert("Migração concluída com sucesso! IDs reajustados e dados transferidos para o Progresso Diário.");
}

/**
 * COMUNICAÇÃO WEB - GET (Lê os dados para o site)
 */
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const abaProgresso = ss.getSheetByName("Progresso Diário");
    const abaPonto = ss.getSheetByName("Registro de Ponto");

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
 * COMUNICAÇÃO WEB - POST (Recebe ações do site e atualiza a planilha)
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Payload vazio." })).setMimeType(ContentService.MimeType.JSON);
    }

    const conteudo = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const abaProgresso = ss.getSheetByName("Progresso Diário");
    const abaPonto = ss.getSheetByName("Registro de Ponto");
    const abaMissoes = ss.getSheetByName("Missões");

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