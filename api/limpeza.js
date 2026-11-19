import { google } from 'googleapis';

function getAuth() {
  const credentialsJson = process.env.GOOGLE_CREDENTIALS;
  if (!credentialsJson) throw new Error('GOOGLE_CREDENTIALS missing');
  const credentials = JSON.parse(credentialsJson);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function getDataHojeStr() {
  const d = new Date();
  const options = { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' };
  return new Intl.DateTimeFormat('pt-BR', options).format(d);
}

function getHoraAtualStr() {
  const d = new Date();
  const options = { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
  return new Intl.DateTimeFormat('pt-BR', options).format(d);
}

// A planilha pode devolver a data em tres formatos:
//   "11/11/2026"  (texto)
//   46327         (serial do Sheets, dias desde 30/12/1899)
//   "2026-11-11"  (ISO)
// Esta funcao normaliza qualquer um deles para "DD/MM/AAAA",
// que e o formato usado em todas as comparacoes do sistema.
function normalizarData(valor) {
  if (valor === null || valor === undefined || valor === '') return '';

  const bruto = String(valor).trim();
  if (bruto === '') return '';

  // Serial do Sheets (dias desde 30/12/1899, com o bug do ano bissexto de 1900).
  // 25559 e o numero de dias entre essa epoca e 01/01/1970.
  // Conferido contra a planilha: 46327 = 11/11/2026.
  if (/^\d+(\.\d+)?$/.test(bruto)) {
    const serial = parseFloat(bruto);
    if (serial > 0 && serial < 100000) {
      const ms = Math.round((serial - 25559) * 86400 * 1000);
      const d = new Date(ms);
      if (!isNaN(d.getTime())) {
        return String(d.getUTCDate()).padStart(2, '0') + '/' +
               String(d.getUTCMonth() + 1).padStart(2, '0') + '/' +
               d.getUTCFullYear();
      }
    }
  }

  // ISO "2026-11-11" ou "2026-11-11T00:00:00"
  const iso = bruto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;

  // Ja em pt-BR: usa so a parte da data, caso venha hora junto
  const ptBr = bruto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (ptBr) {
    return String(ptBr[1]).padStart(2, '0') + '/' + String(ptBr[2]).padStart(2, '0') + '/' + ptBr[3];
  }

  return bruto;
}

function parseDataPtBrParaMs(dataStr) {
  if (!dataStr) return 0;
  const partes = String(dataStr).trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!partes) return 0;
  return new Date(`${partes[3]}-${partes[2].padStart(2, '0')}-${partes[1].padStart(2, '0')}T00:00:00-03:00`).getTime();
}

function columnToLetter(column) {
  let temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

// Regra fixa da planilha: a linha 1 e sempre vazia e o cabecalho fica na linha 2.
// O mapeamento de colunas usa o proprio texto do cabecalho, sem lista fixa de nomes,
// entao renomear ou criar colunas nao quebra o codigo.
const LINHA_CABECALHO = 1; // indice 0-based da linha 2

function parseSheetRows(rows) {
  if (!rows || rows.length === 0) {
    return { headerRowIndex: LINHA_CABECALHO, colMap: {}, dataRows: [] };
  }

  const colMap = {};
  const cabecalho = rows[LINHA_CABECALHO] || [];
  cabecalho.forEach((cell, idx) => {
    if (cell !== undefined && cell !== null && String(cell).trim() !== '') {
      colMap[String(cell).trim()] = idx;
    }
  });

  const dataRows = rows.slice(LINHA_CABECALHO + 1);
  return { headerRowIndex: LINHA_CABECALHO, colMap, dataRows };
}

// Abas que o painel de exclusao pode manipular.
// A ordem importa: e a mesma em que aparecem na tela.
const ABAS_PAINEL = ["Missões", "Progresso Diário", "Registro de Ponto", "Conquistas"];

// Titulo amigavel de cada aba, para o front nao precisar traduzir.
const ROTULO_ABA = {
  "Missões": "Missões",
  "Progresso Diário": "Progresso Diário",
  "Registro de Ponto": "Registro de Ponto",
  "Conquistas": "Conquistas"
};

// Colunas que devem aparecer na previa de cada aba.
const COLUNAS_PREVIA = {
  "Missões": ["ID", "Título da Missão", "Cômodo", "Tempo Estimado (Minutos)", "Frequência (Dias)", "Prioridade", "Ordem"],
  "Progresso Diário": ["ID", "Data", "Título da Missão", "Cômodo", "Status", "Hora de Início", "Hora de Término"],
  "Registro de Ponto": ["ID Turno", "Data", "Hora Entrada", "Hora Saída", "Tempo Trabalhado", "Status do Turno"],
  "Conquistas": ["ID", "Título", "Raridade", "Tipo de Meta", "Filtro", "Meta", "Progresso Atual", "Status", "Data Conquista"]
};

// Le uma aba e devolve as linhas prontas para a previa, com o numero REAL da linha
// na planilha (1-based), que e o que o deleteDimension precisa.
async function lerAbaParaPainel(sheets, spreadsheetId, nomeAba) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${nomeAba}!A:Z` });
  const rows = res.data.values || [];
  const { colMap, dataRows } = parseSheetRows(rows);

  const colunas = (COLUNAS_PREVIA[nomeAba] || []).filter(c => colMap[c] !== undefined);

  const linhas = dataRows
    .map((row, idx) => {
      const numeroLinha = idx + LINHA_CABECALHO + 2; // 1-based, linha 3 em diante
      const celulas = colunas.map(col => {
        const v = row[colMap[col]];
        return v === undefined || v === null ? "" : String(v);
      });
      // Considera vazia quando TODAS as colunas de previa estao em branco
      const vazia = celulas.every(v => v.trim() === "");
      return { numeroLinha, celulas, vazia };
    })
    .filter(l => !l.vazia); // linhas totalmente em branco nao aparecem

  return { colunas, linhas, colMap };
}

function normalizarStatusMissao(valor) {
  const chave = String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, '');
  if (['concluido', 'concluida', 'finalizado', 'finalizada'].includes(chave)) return 'Concluído';
  if (['cancelado', 'cancelada'].includes(chave)) return 'Cancelado';
  if (chave === 'emandamento') return 'Em Andamento';
  return 'Pendente';
}

function selecionarMissao(dados, pedido, hojeStr) {
  const dataAlvo = String(pedido.data || hojeStr).trim();
  if (pedido.id === undefined || pedido.id === null || pedido.id === '') return null;
  const candidatas = dados.filter(m => String(m.id) === String(pedido.id) && normalizarData(m.data) === normalizarData(dataAlvo));
  return candidatas.length === 1 ? candidatas[0] : null;
}

async function getSheetData(sheets, spreadsheetId, rangeName) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: rangeName });
  const rows = res.data.values;
  if (!rows || rows.length === 0) return [];

  const { colMap, dataRows } = parseSheetRows(rows);

  return dataRows.map((row, rIdx) => {
    let obj = { _linha: rIdx + (rows.length - dataRows.length + 1) }; 
    Object.keys(colMap).forEach(key => {
      obj[key] = row[colMap[key]] !== undefined ? row[colMap[key]] : '';
    });
    obj.id = obj["ID"] || obj["ID Turno"] || obj.id || "";
    obj.data = normalizarData(obj["Data"] || "");
    obj.titulo = obj["Título da Missão"] || "";
    obj.comodo = obj["Cômodo"] || "";
    obj.tempoEstimado = obj["Tempo Estimado (Minutos)"] || obj["Tempo Est. (min)"] || "";
    obj.tempoMedio = obj["Tempo Médio (Minutos)"] || "";
    obj.prioridade = obj["Prioridade"] || "";
    obj.frequenciaDias = parseInt(obj["Frequência (Dias)"] || 1, 10) || 1;
    // Ordem de execucao (coluna opcional "Ordem" na aba Missoes). 0 = sem ordem.
    obj.ordem = parseInt(obj["Ordem"], 10) || 0;
    obj.status = obj["Status"] !== undefined ? normalizarStatusMissao(obj["Status"]) : obj["Status do Turno"] || "";
    if (obj["Status"] !== undefined) obj["Status"] = obj.status;
    return obj;
  });
}

// Cor das linhas internas da tabela (cinza claro). Serve tanto nas celulas de fundo
// escuro quanto no corpo: nao briga com nenhuma das duas areas.
// Paleta de bordas (regra do dono da planilha):
//   externa  -> MEDIA, preta
//   interna  -> FINA, laranja
//   cabecalho -> FINA, preta (interna e embaixo)
const COR_PRETA   = { red: 0, green: 0, blue: 0 };
const COR_LARANJA = { red: 1, green: 0.42, blue: 0 };
const BORDA_EXTERNA = { style: "SOLID_MEDIUM", color: COR_PRETA };
const BORDA_INTERNA = { style: "SOLID", color: COR_LARANJA };
const BORDA_CABECALHO = { style: "SOLID", color: COR_PRETA };

async function formatarTabelaCompleta(sheets, spreadsheetId, sheetName) {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetObj = meta.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheetObj) return;
    const sheetId = sheetObj.properties.sheetId;

    const resVals = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A:Z` });
    const rows = resVals.data.values || [];
    if (rows.length === 0) return;

    const { headerRowIndex, colMap } = parseSheetRows(rows);
    const validColIndexes = Object.values(colMap);
    if (validColIndexes.length === 0 || headerRowIndex === -1) return;

    const startRowIndex = headerRowIndex;

    // ULTIMA LINHA COM DADO, de verdade.
    // rows.length e o tamanho do range lido (A:Z), nao dos dados: pode ter
    // centenas de linhas vazias no fim. Formatar por rows.length pinta
    // borda em celula vazia (foi o bug de 763 linhas vazias no Progresso Diario).
    let endRowIndex = headerRowIndex + 1;
    for (let i = rows.length - 1; i > headerRowIndex; i--) {
      const row = rows[i] || [];
      const temDado = validColIndexes.some(cIdx => String(row[cIdx] ?? "").trim() !== "");
      if (temDado) {
        endRowIndex = i + 1;
        break;
      }
    }

    const startColumnIndex = Math.min(...validColIndexes);
    const endColumnIndex = Math.max(...validColIndexes) + 1;

    let requests = [
      {
        repeatCell: {
          range: { sheetId, startRowIndex: startRowIndex + 1, endRowIndex, startColumnIndex, endColumnIndex },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: "CENTER",
              verticalAlignment: "MIDDLE",
              textFormat: { fontFamily: "Roboto", fontSize: 10 }
            }
          },
          fields: "userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment,userEnteredFormat.textFormat"
        }
      }
    ];

    const tituloColIdx = colMap["Título da Missão"];
    if (tituloColIdx !== undefined) {
      requests.push({
        repeatCell: {
          range: { sheetId, startRowIndex: startRowIndex + 1, endRowIndex, startColumnIndex: tituloColIdx, endColumnIndex: tituloColIdx + 1 },
          cell: { userEnteredFormat: { horizontalAlignment: "LEFT" } },
          fields: "userEnteredFormat.horizontalAlignment"
        }
      });
    }

    requests.push({
      repeatCell: {
        range: { sheetId, startRowIndex, endRowIndex: startRowIndex + 1, startColumnIndex, endColumnIndex },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.2, green: 0.25, blue: 0.3 },
            textFormat: { fontFamily: "Roboto", fontSize: 10, bold: true, foregroundColor: { red: 1, green: 1, blue: 1 } },
            horizontalAlignment: "CENTER",
            verticalAlignment: "MIDDLE"
          }
        },
        fields: "userEnteredFormat.backgroundColor,userEnteredFormat.textFormat,userEnteredFormat.horizontalAlignment,userEnteredFormat.verticalAlignment"
      }
    });

    // 1) Borda externa da tabela inteira: MEDIA, preta
    requests.push({
      updateBorders: {
        range: { sheetId, startRowIndex, endRowIndex, startColumnIndex, endColumnIndex },
        top:    BORDA_EXTERNA,
        bottom: BORDA_EXTERNA,
        left:   BORDA_EXTERNA,
        right:  BORDA_EXTERNA
      }
    });

    // 2) Bordas internas do corpo: FINA, laranja
    if (endRowIndex > startRowIndex + 1) {
      requests.push({
        updateBorders: {
          range: { sheetId, startRowIndex: startRowIndex + 1, endRowIndex, startColumnIndex, endColumnIndex },
          innerHorizontal: BORDA_INTERNA,
          innerVertical:   BORDA_INTERNA
        }
      });
    }

    // 3) Cabecalho: FINA, preta (interna e embaixo).
    // Vem por ULTIMO para sobrescrever o laranja do passo 2 na faixa do cabecalho.
    requests.push({
      updateBorders: {
        range: { sheetId, startRowIndex, endRowIndex: startRowIndex + 1, startColumnIndex, endColumnIndex },
        bottom: BORDA_CABECALHO,
        innerVertical: BORDA_CABECALHO
      }
    });

    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  } catch (e) {
    console.error(`Erro ao formatar tabela ${sheetName}:`, e);
  }
}

// ===== CICLO DE FOLGA =====
// A configuracao mora na aba "Configuracoes" (linha 2 = cabecalho, coluna B = chave, C = valor).
// A contagem de dias trabalhados vem do "Registro de Ponto": 1 turno por dia conta 1 dia.
const ABA_CONFIG = "Configurações";
const CONFIG_PADRAO = { diasParaFolga: 9 };

async function lerConfiguracoes(sheets, spreadsheetId) {
  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${ABA_CONFIG}!A:D` });
    const rows = res.data.values || [];
    const cfg = { ...CONFIG_PADRAO };
    for (let i = 2; i < rows.length; i++) {          // linha 1 vazia, linha 2 = cabecalho
      const chave = String((rows[i] && rows[i][1]) || "").trim();
      const valor = rows[i] && rows[i][2];
      if (!chave || valor === undefined || valor === "") continue;
      cfg[chave] = valor;
    }
    cfg.diasParaFolga = parseInt(cfg.diasParaFolga, 10) || CONFIG_PADRAO.diasParaFolga;
    if (cfg.diasParaFolga < 1) cfg.diasParaFolga = CONFIG_PADRAO.diasParaFolga;
    return cfg;
  } catch (e) {
    console.error("[lerConfiguracoes] ERRO:", e && e.message);
    return { ...CONFIG_PADRAO };
  }
}

async function salvarConfiguracoes(sheets, spreadsheetId, patch) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${ABA_CONFIG}!A:D` });
  const rows = res.data.values || [];
  const chaves = {};
  for (let i = 2; i < rows.length; i++) {
    const chave = String((rows[i] && rows[i][1]) || "").trim();
    if (chave) chaves[chave] = i + 1;               // numero da linha na planilha
  }

  const atualizacoes = [];
  const novasLinhas = [];

  Object.keys(patch).forEach(chave => {
    const valor = patch[chave];
    if (chaves[chave]) {
      atualizacoes.push({ range: `${ABA_CONFIG}!C${chaves[chave]}`, values: [[valor]] });
    } else {
      novasLinhas.push([chave, valor]);
    }
  });

  if (atualizacoes.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: { valueInputOption: 'USER_ENTERED', data: atualizacoes }
    });
  }

  if (novasLinhas.length > 0) {
    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: `${ABA_CONFIG}!B${rows.length + 1}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: novasLinhas }
    });
  }

  return await lerConfiguracoes(sheets, spreadsheetId);
}

// Conta quantos dias distintos tiveram turno desde a data de referencia.
// referenciaVazia = conta todos os dias com turno na planilha.
// Um dia so conta para o ciclo de folga se for RIGOROSO:
//   1) teve turno no Registro de Ponto
//   2) TODAS as missoes lancadas naquele dia foram CONCLUIDAS
//      ("Cancelado" nao conta como concluido; "Pendente"/"Em Andamento" reprovam o dia)
//   3) a contagem e em SEQUENCIA: no primeiro dia invalido a contagem para e
//      vale o que foi acumulado antes dele. Um buraco depois nao apaga o passado,
//      mas os dias apos o buraco nao somam.
function contarDiasTrabalhados(turnos, referenciaStr, progresso) {
  const refMs = referenciaStr ? parseDataPtBrParaMs(referenciaStr) : 0;

  // dias com turno (apos a ultima folga)
  const diasComTurno = new Map(); // "13/11/2026" -> ms
  (turnos || []).forEach(t => {
    const dataNorm = normalizarData(t.data);
    if (!dataNorm) return;
    const ms = parseDataPtBrParaMs(dataNorm);
    if (!ms) return;
    if (refMs && ms <= refMs) return;
    diasComTurno.set(dataNorm, ms);
  });
  if (diasComTurno.size === 0) return 0;

  // status das missoes por dia
  const missoesPorDia = new Map(); // data -> { total, concluidas }
  (progresso || []).forEach(pRow => {
    const dataNorm = normalizarData(pRow.data);
    if (!dataNorm) return;
    const ms = parseDataPtBrParaMs(dataNorm);
    if (!ms) return;
    if (refMs && ms <= refMs) return;
    if (!diasComTurno.has(dataNorm)) return;
    const st = normalizarStatusMissao(pRow.status);
    const reg = missoesPorDia.get(dataNorm) || { total: 0, concluidas: 0 };
    reg.total += 1;
    if (st === 'Concluído') reg.concluidas += 1;
    missoesPorDia.set(dataNorm, reg);
  });

  // ordena os dias com turno do mais antigo para o mais recente
  const ordenados = Array.from(diasComTurno.entries())
    .sort((a, b) => a[1] - b[1]);

  // conta em sequencia até o primeiro dia que reprova
  let validos = 0;
  for (const [dataStr] of ordenados) {
    const reg = missoesPorDia.get(dataStr);
    const diaValido = !!reg && reg.total > 0 && reg.concluidas === reg.total;
    if (!diaValido) break;
    validos += 1;
  }
  return validos;
}

// Devolve o estado do ciclo de folga para hoje.
// Usa "ultimaFolga" (data) como marco zero; sem ela, conta todos os dias trabalhados.
function calcularCicloFolga(cfg, turnos, hojeStr, progresso) {
  const diasParaFolga = parseInt(cfg.diasParaFolga, 10) || CONFIG_PADRAO.diasParaFolga;
  const ultimaFolga = cfg.ultimaFolga ? normalizarData(cfg.ultimaFolga) : "";

  const trabalhouHoje = (turnos || []).some(t => normalizarData(t.data) === hojeStr);
  const diasTrabalhados = contarDiasTrabalhados(turnos, ultimaFolga, progresso);

  // "pularFolgaAte": se voce decidiu trabalhar no dia de folga, a folga
  // e empurrada para depois dessa data.
  const pularAte = cfg.pularFolgaAte ? normalizarData(cfg.pularFolgaAte) : "";
  const hojeMs = parseDataPtBrParaMs(hojeStr);
  const puladaHoje = pularAte && parseDataPtBrParaMs(pularAte) >= hojeMs;

  // A folga e o dia SEGUINTE ao fechamento do ciclo.
  // Se voce bateu ponto hoje, o ciclo ja avancou hoje: hoje nao e folga.
  // Sem turno hoje e com o ciclo cheio, hoje e o dia de folga.
  const valorTeste = cfg.modoTeste;
  const modoTeste = valorTeste === true
    || String(valorTeste || '').toUpperCase() === 'TRUE';
  const cicloCheio = diasTrabalhados >= diasParaFolga;
  const ehFolgaHoje = modoTeste || (!puladaHoje && cicloCheio && !trabalhouHoje);
  const faltam = Math.max(0, diasParaFolga - diasTrabalhados);

  return {
    diasParaFolga: diasParaFolga,
    diasTrabalhados: diasTrabalhados,
    faltam: faltam,
    cicloCheio: cicloCheio,
    modoTeste: modoTeste,
    ehFolgaHoje: ehFolgaHoje,
    trabalhouHoje: trabalhouHoje,
    ultimaFolga: ultimaFolga,
    pularFolgaAte: pularAte
  };
}

async function sincronizarMissossDoDiaEmSegundoPlano(sheets, spreadsheetId) {
  try {
    const hojeStr = getDataHojeStr();
    const hojeMs = parseDataPtBrParaMs(hojeStr);

    // Dia de folga: nao lanca missao nenhuma.
    try {
      const cfg = await lerConfiguracoes(sheets, spreadsheetId);
      const turnosParaCiclo = await getSheetData(sheets, spreadsheetId, "Registro de Ponto!A:Z");
      const progressoParaCiclo = await getSheetData(sheets, spreadsheetId, "Progresso Diário!A:Z");
      const ciclo = calcularCicloFolga(cfg, turnosParaCiclo, hojeStr, progressoParaCiclo);
      if (ciclo.ehFolgaHoje) {
        console.log("[sincronizar] Hoje e dia de folga - nenhuma missao sera lancada.");
        return;
      }
    } catch (eCiclo) {
      console.error("[sincronizar] falha ao avaliar folga (segue normal):", eCiclo && eCiclo.message);
    }
    
    const missoesRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Missões!A:Z" });
    const mParsed = parseSheetRows(missoesRes.data.values || []);
    if (mParsed.dataRows.length === 0) return;
    const mColMap = mParsed.colMap;

    const progRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Progresso Diário!A:Z" });
    const pRows = progRes.data.values || [];
    const pParsed = parseSheetRows(pRows);
    const pColMap = pParsed.colMap;
    const pData = pParsed.dataRows;

    const missoesHojeNaPlanilha = pData.filter(row => {
      const dataVal = row[pColMap["Data"]] || "";
      return normalizarData(dataVal) === hojeStr;
    });

    let maxId = 999;
    pData.forEach(row => {
      const idVal = parseInt(row[pColMap["ID"]], 10);
      if (!isNaN(idVal) && idVal > maxId) maxId = idVal;
    });

    let nextRow = pRows.length + 1;
    let newRows = [];
    let currentId = maxId + 1;

    // Controlar para garantir que missões repetidas no mesmo dia sejam únicas na aba Progresso Diário
    // Chave = titulo + comodo (mesma missao em comodos diferentes e missao diferente).
    const chaveMissao = (t, c) => String(t || "").trim().toLowerCase() + "|" + String(c || "").trim().toLowerCase();
    const titulosAdicionadosHoje = new Set(missoesHojeNaPlanilha.map(r => chaveMissao(r[pColMap["Título da Missão"]], r[pColMap["Cômodo"]])));

    mParsed.dataRows.forEach(mRow => {
      let titulo = mRow[mColMap["Título da Missão"]] || "";
      let comodo = mRow[mColMap["Cômodo"]] || "";
      let tempoMedio = mRow[mColMap["Tempo Médio (Minutos)"]] || "";
      let prioridade = mRow[mColMap["Prioridade"]] || "Média";
      let frequenciaDias = parseInt(mRow[mColMap["Frequência (Dias)"]] || 1, 10) || 1;
      // Ordem de execucao escolhida no modal "Ordem" (0/"" = sem ordem).
      let ordemMissao = parseInt(mRow[mColMap["Ordem"]] || 0, 10) || 0;

      if (titulo) {
        const tituloLower = chaveMissao(titulo, comodo);
        if (!titulosAdicionadosHoje.has(tituloLower)) {
          // A PLANILHA CALCULA, O CODIGO APENAS LE.
          // Coluna I (Ultima), J (Proxima) e F (Tempo Medio) sao formulas (MAP/FILTER/LAMBDA).
          // Nada aqui refaz essas contas: le-se o valor ja calculado.
          const ultimaStr = mRow[mColMap["Última"]] || "";
          const ultimaConclusaoMs = parseDataPtBrParaMs(ultimaStr);

          // Tempo: usa o "Tempo Medio (Minutos)" da coluna F.
          // Se a formula devolver "-" (missao nunca concluida), cai no Tempo Estimado.
          const tMedioNum = parseFloat(tempoMedio);
          let tempoParaLancar;
          if (!isNaN(tMedioNum) && tMedioNum > 0) {
            tempoParaLancar = tMedioNum;
          } else {
            tempoParaLancar = mRow[mColMap["Tempo Estimado (Minutos)"]] || mRow[mColMap["Tempo Est. (min)"]] || 15;
          }

          // Lanca quando a data da coluna J (Proxima) ja chegou.
          // J usa MAX(ultima + frequencia, HOJE), entao nunca fica no passado.
          let deveLancar = true;
          const proximaStr = mRow[mColMap["Próxima"]] || "";
          const proximaMs = parseDataPtBrParaMs(proximaStr);
          if (proximaMs > 0 && proximaMs > hojeMs) {
            deveLancar = false;
          }

          if (deveLancar) {
            let maxColIndex = Math.max(...Object.values(pColMap), 0);
            let rowArray = new Array(maxColIndex + 1).fill("");
            
            if (pColMap["ID"] !== undefined) rowArray[pColMap["ID"]] = currentId;
            if (pColMap["Data"] !== undefined) rowArray[pColMap["Data"]] = hojeStr;
            if (pColMap["Título da Missão"] !== undefined) rowArray[pColMap["Título da Missão"]] = titulo;
            if (pColMap["Cômodo"] !== undefined) rowArray[pColMap["Cômodo"]] = comodo;
            if (pColMap["Tempo Estimado (Minutos)"] !== undefined) rowArray[pColMap["Tempo Estimado (Minutos)"]] = tempoParaLancar;
            else if (pColMap["Tempo Est. (min)"] !== undefined) rowArray[pColMap["Tempo Est. (min)"]] = tempoParaLancar;
            if (pColMap["Frequência (Dias)"] !== undefined) rowArray[pColMap["Frequência (Dias)"]] = frequenciaDias;
            if (pColMap["Prioridade"] !== undefined) rowArray[pColMap["Prioridade"]] = prioridade;
            if (pColMap["Status"] !== undefined) rowArray[pColMap["Status"]] = "Pendente";
            if (pColMap["Hora de Início"] !== undefined) rowArray[pColMap["Hora de Início"]] = "";
            if (pColMap["Hora de Término"] !== undefined) rowArray[pColMap["Hora de Término"]] = "";

            newRows.push({ rowArray, ordem: ordemMissao });
            titulosAdicionadosHoje.add(tituloLower);
            currentId++;
          }
        }
      }
    });

    // Lanca na ordem escolhida (coluna "Ordem"). Sem ordem, mantem a ordem da planilha.
    newRows.sort((a, b) => {
      const oa = a.ordem || 0, ob = b.ordem || 0;
      if (oa > 0 && ob > 0 && oa !== ob) return oa - ob;
      if (oa > 0 && ob === 0) return -1;
      if (oa === 0 && ob > 0) return 1;
      return 0;
    });

    if (newRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `Progresso Diário!A${nextRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: newRows.map(r => r.rowArray) }
      });

      // So formata quando linhas novas foram criadas. Sem linha nova, o formato
      // ja esta gravado na planilha e reaplicar seria trabalho sem resultado.
      await formatarTabelaCompleta(sheets, spreadsheetId, "Missões");
      await formatarTabelaCompleta(sheets, spreadsheetId, "Progresso Diário");
    }
  } catch (e) {
    console.error("Erro ao sincronizar missões do dia:", e);
  }
}

// ===== CONQUISTAS (TROFEUS) =====
// Aba "Conquistas": linha 1 vazia, cabecalho na linha 2, dados da linha 3, coluna A vazia.
const ABA_CONQUISTAS = "Conquistas";
const COLS_CONQUISTAS = ["ID", "Título", "Descrição", "Ícone", "Raridade", "Tipo de Meta", "Filtro", "Meta", "Progresso Atual", "Status", "Data Conquista"];
const TIPOS_META = {
  missoes_total: "Missões concluídas (total)",
  missoes_comodo: "Missões concluídas em um cômodo",
  missoes_tarefa: "Vezes que concluiu uma tarefa",
  dias_zerados: "Dias zerados",
  sequencia_dias: "Sequência de dias zerados",
  dias_trabalhados: "Dias trabalhados",
  tempo_economizado: "Tempo economizado (min)"
};
const RARIDADES = ["Comum", "Raro", "Épico", "Lendário"];

const CONQUISTAS_INICIAIS = [
  // --- Primeiros passos ---
  ["Primeiro Passo", "Conclua sua primeira missão.", "🧹", "Comum", "missoes_total", "", 1],
  ["Mãos à Obra", "Conclua 10 missões.", "🧽", "Comum", "missoes_total", "", 10],
  ["Faxineiro Dedicado", "Conclua 50 missões.", "🪣", "Raro", "missoes_total", "", 50],
  ["Veterano do Pano", "Conclua 100 missões.", "🧴", "Raro", "missoes_total", "", 100],
  ["Mestre da Limpeza", "Conclua 200 missões.", "💎", "Épico", "missoes_total", "", 200],
  ["Lenda Viva da Casa", "Conclua 500 missões.", "🌟", "Lendário", "missoes_total", "", 500],
  ["Imortal do Esfregão", "Conclua 1000 missões.", "☄️", "Lendário", "missoes_total", "", 1000],

  // --- Dias zerados ---
  ["Dia Zerado", "Conclua todas as missões de um dia.", "🏆", "Comum", "dias_zerados", "", 1],
  ["Trio de Ouro", "Feche 3 dias zerados.", "🎯", "Comum", "dias_zerados", "", 3],
  ["Dez de Dez", "Feche 10 dias zerados.", "🥇", "Raro", "dias_zerados", "", 10],
  ["Mês Impecável", "Feche 30 dias zerados.", "📆", "Épico", "dias_zerados", "", 30],
  ["Centurião", "Feche 100 dias zerados.", "🏛️", "Lendário", "dias_zerados", "", 100],

  // --- Sequências ---
  ["Embalo", "3 dias zerados em sequência.", "🎵", "Comum", "sequencia_dias", "", 3],
  ["Semana Impecável", "7 dias zerados em sequência.", "🔥", "Raro", "sequencia_dias", "", 7],
  ["Quinzena de Ferro", "15 dias zerados em sequência.", "🛡️", "Épico", "sequencia_dias", "", 15],
  ["Lenda da Casa", "30 dias zerados em sequência.", "👑", "Lendário", "sequencia_dias", "", 30],
  ["Máquina do Tempo", "60 dias zerados em sequência.", "⏳", "Lendário", "sequencia_dias", "", 60],

  // --- Dias trabalhados ---
  ["Primeiro Turno", "Trabalhe 1 dia.", "🕐", "Comum", "dias_trabalhados", "", 1],
  ["Ciclo Completo", "Trabalhe 9 dias.", "📅", "Raro", "dias_trabalhados", "", 9],
  ["Meia Maratona", "Trabalhe 25 dias.", "🏃", "Raro", "dias_trabalhados", "", 25],
  ["Cinquentão", "Trabalhe 50 dias.", "🎖️", "Épico", "dias_trabalhados", "", 50],
  ["Centenário", "Trabalhe 100 dias.", "💯", "Lendário", "dias_trabalhados", "", 100],
  ["Ano de Serviço", "Trabalhe 365 dias.", "🗓️", "Lendário", "dias_trabalhados", "", 365],

  // --- Tempo economizado ---
  ["Relâmpago", "Economize 60 minutos no total.", "⚡", "Épico", "tempo_economizado", "", 60],
  ["Cronômetro Quebrado", "Economize 120 minutos no total.", "⏱️", "Raro", "tempo_economizado", "", 120],
  ["Meio Dia Livre", "Economize 480 minutos (8 horas) no total.", "🌤️", "Épico", "tempo_economizado", "", 480],
  ["Férias Antecipadas", "Economize 1440 minutos (24 horas) no total.", "🏖️", "Lendário", "tempo_economizado", "", 1440],
  ["Doador de Tempo", "Economize 2880 minutos (48 horas) no total.", "⌛", "Lendário", "tempo_economizado", "", 2880],

  // --- Por cômodo ---
  ["Cozinheiro de Elite", "Conclua 25 missões na Cozinha.", "🍳", "Raro", "missoes_comodo", "Cozinha", 25],
  ["Chef Estrelado", "Conclua 100 missões na Cozinha.", "👨‍🍳", "Épico", "missoes_comodo", "Cozinha", 100],
  ["Banheiro Brilhando", "Conclua 25 missões no Banheiro.", "🚿", "Raro", "missoes_comodo", "Banheiro", 25],
  ["Sanitário Perfeito", "Conclua 100 missões no Banheiro.", "🧼", "Épico", "missoes_comodo", "Banheiro", 100],
  ["Quarto dos Sonhos", "Conclua 25 missões no Quarto.", "🛏️", "Raro", "missoes_comodo", "Quarto", 25],
  ["Sono dos Justos", "Conclua 100 missões no Quarto.", "😴", "Épico", "missoes_comodo", "Quarto", 100],
  ["Sala de Estar VIP", "Conclua 25 missões na Sala.", "🛋️", "Raro", "missoes_comodo", "Sala", 25],
  ["Cinema em Casa", "Conclua 100 missões na Sala.", "📺", "Épico", "missoes_comodo", "Sala", 100],
  ["Roupa no Varal", "Conclua 25 missões na Lavanderia.", "🧺", "Raro", "missoes_comodo", "Lavanderia", 25],
  ["Lavanderia Industrial", "Conclua 100 missões na Lavanderia.", "🌀", "Épico", "missoes_comodo", "Lavanderia", 100],
  ["Jardineiro Caprichoso", "Conclua 25 missões no Quintal.", "🌱", "Raro", "missoes_comodo", "Quintal", 25],
  ["Guardião do Quintal", "Conclua 100 missões no Quintal.", "🌳", "Épico", "missoes_comodo", "Quintal", 100],
  ["Corredor Impecável", "Conclua 25 missões no Corredor.", "🚪", "Raro", "missoes_comodo", "Corredor", 25],
  ["Passagem Limpa", "Conclua 100 missões no Corredor.", "✨", "Épico", "missoes_comodo", "Corredor", 100]
];


function chaveTipoMeta(valor) {
  const v = String(valor || "").trim();
  if (TIPOS_META[v]) return v;
  const achada = Object.keys(TIPOS_META).find(k => TIPOS_META[k].toLowerCase() === v.toLowerCase());
  return achada || "";
}

function horaParaSeg(h) {
  const m = String(h || "").trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  return m ? (+m[1]) * 3600 + (+m[2]) * 60 + (+(m[3] || 0)) : null;
}

function normTxt(s) {
  return String(s || "").normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

async function garantirAbaConquistas(sheets, spreadsheetId) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  if (meta.data.sheets.some(s => s.properties.title === ABA_CONQUISTAS)) return false;

  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: { requests: [{ addSheet: { properties: { title: ABA_CONQUISTAS } } }] }
  });

  const linhas = CONQUISTAS_INICIAIS.map((c, i) => [
    1000 + i + 1, c[0], c[1], c[2], c[3], TIPOS_META[c[4]], c[5], c[6], 0, "Bloqueada", ""
  ]);
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${ABA_CONQUISTAS}!B2`,
    valueInputOption: 'RAW',
    requestBody: { values: [COLS_CONQUISTAS, ...linhas] }
  });
  await formatarTabelaCompleta(sheets, spreadsheetId, ABA_CONQUISTAS);
  return true;
}

async function lerConquistasBrutas(sheets, spreadsheetId) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${ABA_CONQUISTAS}!A:Z` });
  const rows = res.data.values || [];
  const { colMap, dataRows } = parseSheetRows(rows);
  const g = (row, nome) => (colMap[nome] !== undefined && row[colMap[nome]] !== undefined) ? String(row[colMap[nome]]) : "";
  const lista = [];
  dataRows.forEach((row, idx) => {
    if (!g(row, "Título").trim()) return;
    const tipoChave = chaveTipoMeta(g(row, "Tipo de Meta"));
    lista.push({
      linha: idx + LINHA_CABECALHO + 2,
      id: g(row, "ID"),
      titulo: g(row, "Título"),
      descricao: g(row, "Descrição"),
      icone: g(row, "Ícone") || "🏆",
      raridade: RARIDADES.includes(g(row, "Raridade")) ? g(row, "Raridade") : "Comum",
      tipoChave,
      tipo: TIPOS_META[tipoChave] || g(row, "Tipo de Meta"),
      filtro: g(row, "Filtro"),
      meta: Math.max(1, parseFloat(g(row, "Meta")) || 1),
      progresso: parseFloat(g(row, "Progresso Atual")) || 0,
      status: normTxt(g(row, "Status")).startsWith("desbloq") ? "Desbloqueada" : "Bloqueada",
      dataConquista: g(row, "Data Conquista")
    });
  });
  return { lista, colMap, totalLinhas: rows.length, rows };
}

// Acrescenta na aba Conquistas as conquistas do catalogo (CONQUISTAS_INICIAIS)
// que ainda nao existem la, sem mexer nas que o usuario criou nem no progresso
// das que ja existem. Roda antes de avaliar, entao conquistas novas entram
// desbloqueadas na hora se a meta ja foi batida.
async function garantirConquistasDoCatalogo(sheets, spreadsheetId, lista, colMap) {
  const existentes = new Set((lista || []).map(c => normTxt(c.titulo)));
  const faltando = CONQUISTAS_INICIAIS.filter(c => !existentes.has(normTxt(c[0])));
  if (faltando.length === 0) return 0;
  if (!colMap || Object.keys(colMap).length === 0) return 0;

  let maxId = 1000;
  (lista || []).forEach(c => { const n = parseInt(c.id, 10); if (!isNaN(n) && n > maxId) maxId = n; });

  const ordem = COLS_CONQUISTAS.filter(n => colMap[n] !== undefined);
  const data = [];
  faltando.forEach((c, i) => {
    const linha = LINHA_CABECALHO + 2 + (lista || []).length + i;
    const valores = {
      "ID": maxId + 1 + i,
      "Título": c[0],
      "Descrição": c[1],
      "Ícone": c[2],
      "Raridade": c[3],
      "Tipo de Meta": TIPOS_META[c[4]] || c[4],
      "Filtro": c[5],
      "Meta": c[6],
      "Progresso Atual": 0,
      "Status": "Bloqueada",
      "Data Conquista": ""
    };
    ordem.forEach(nome => {
      data.push({ range: `${ABA_CONQUISTAS}!${columnToLetter(colMap[nome] + 1)}${linha}`, values: [[valores[nome]]] });
    });
  });

  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data } });
  await formatarTabelaCompleta(sheets, spreadsheetId, ABA_CONQUISTAS);
  return faltando.length;
}

function calcularMetricasConquistas(progresso, turnos) {
  const concl = (progresso || []).filter(p => p.status === 'Concluído');

  // dias com missoes
  const porDia = new Map();
  (progresso || []).forEach(p => {
    const d = normalizarData(p.data);
    const ms = parseDataPtBrParaMs(d);
    if (!d || !ms) return;
    const r = porDia.get(d) || { ms, total: 0, concl: 0 };
    r.total++;
    if (p.status === 'Concluído') r.concl++;
    porDia.set(d, r);
  });
  const diasTurno = new Set();
  (turnos || []).forEach(t => { const d = normalizarData(t.data); if (d) diasTurno.add(d); });

  let diasZerados = 0, melhor = 0, atual = 0;
  Array.from(porDia.entries()).sort((a, b) => a[1].ms - b[1].ms).forEach(([d, r]) => {
    const valido = r.total > 0 && r.concl === r.total;
    if (valido) diasZerados++;
    if (valido && diasTurno.has(d)) { atual++; if (atual > melhor) melhor = atual; }
    else atual = 0;
  });

  let economizadoSeg = 0;
  concl.forEach(p => {
    const est = (parseFloat(p.tempoEstimado) || 0) * 60;
    const ini = horaParaSeg(p["Hora de Início"]);
    const fim = horaParaSeg(p["Hora de Término"]);
    if (est > 0 && ini !== null && fim !== null && fim >= ini) {
      const real = fim - ini;
      if (est > real) economizadoSeg += (est - real);
    }
  });

  return { concl, diasZerados, sequencia: melhor, diasTrabalhados: diasTurno.size, economizadoMin: Math.floor(economizadoSeg / 60) };
}

function progressoDaConquista(c, m) {
  switch (c.tipoChave) {
    case 'missoes_total': return m.concl.length;
    case 'missoes_comodo': return m.concl.filter(p => normTxt(p.comodo) === normTxt(c.filtro)).length;
    case 'missoes_tarefa': return m.concl.filter(p => normTxt(p.titulo) === normTxt(c.filtro)).length;
    case 'dias_zerados': return m.diasZerados;
    case 'sequencia_dias': return m.sequencia;
    case 'dias_trabalhados': return m.diasTrabalhados;
    case 'tempo_economizado': return m.economizadoMin;
    default: return 0;
  }
}

// Recalcula o progresso, grava so o que mudou e devolve as conquistas + as recem-desbloqueadas.
async function avaliarConquistas(sheets, spreadsheetId) {
  await garantirAbaConquistas(sheets, spreadsheetId);
  const progresso = await getSheetData(sheets, spreadsheetId, "Progresso Diário!A:Z");
  const turnos = await getSheetData(sheets, spreadsheetId, "Registro de Ponto!A:Z");
  const metricas = calcularMetricasConquistas(progresso, turnos);
  const { lista, colMap } = await lerConquistasBrutas(sheets, spreadsheetId);

  // Conquistas novas do catalogo entram na planilha sozinhas (uma vez cada).
  try {
    const adicionadas = await garantirConquistasDoCatalogo(sheets, spreadsheetId, lista, colMap);
    if (adicionadas > 0) {
      const relido = await lerConquistasBrutas(sheets, spreadsheetId);
      lista.length = 0;
      relido.lista.forEach(c => lista.push(c));
      Object.keys(colMap).forEach(k => delete colMap[k]);
      Object.keys(relido.colMap).forEach(k => { colMap[k] = relido.colMap[k]; });
    }
  } catch (eCat) {
    console.error("[avaliarConquistas] falha ao adicionar conquistas do catalogo:", eCat && eCat.message);
  }

  const agoraStr = `${getDataHojeStr()} ${getHoraAtualStr().slice(0, 5)}`;
  const updates = [];
  const novas = [];
  const col = nome => columnToLetter(colMap[nome] + 1);

  lista.forEach(c => {
    const bruto = progressoDaConquista(c, metricas);
    const prog = Math.min(bruto, c.meta);
    const novoProg = c.status === 'Desbloqueada' ? Math.max(prog, c.meta) : prog;
    if (colMap["Progresso Atual"] !== undefined && novoProg !== c.progresso) {
      updates.push({ range: `${ABA_CONQUISTAS}!${col("Progresso Atual")}${c.linha}`, values: [[novoProg]] });
    }
    c.progresso = novoProg;
    if (c.status !== 'Desbloqueada' && bruto >= c.meta) {
      c.status = 'Desbloqueada';
      c.dataConquista = agoraStr;
      novas.push({ id: c.id, titulo: c.titulo, icone: c.icone, raridade: c.raridade });
      if (colMap["Status"] !== undefined) updates.push({ range: `${ABA_CONQUISTAS}!${col("Status")}${c.linha}`, values: [["Desbloqueada"]] });
      if (colMap["Data Conquista"] !== undefined) updates.push({ range: `${ABA_CONQUISTAS}!${col("Data Conquista")}${c.linha}`, values: [[agoraStr]] });
    }
  });

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data: updates } });
  }
  return { conquistas: lista, novas };
}

async function adicionarConquista(sheets, spreadsheetId, d) {
  await garantirAbaConquistas(sheets, spreadsheetId);
  const titulo = String(d.titulo || "").trim();
  const tipoChave = chaveTipoMeta(d.tipoMeta);
  const meta = parseFloat(d.meta);
  if (!titulo) return { erro: "Informe o título." };
  if (!tipoChave) return { erro: "Tipo de meta inválido." };
  if (!Number.isFinite(meta) || meta < 1 || meta > 100000) return { erro: "A meta deve ser um número entre 1 e 100000." };
  const filtro = String(d.filtro || "").trim();
  if ((tipoChave === 'missoes_comodo' || tipoChave === 'missoes_tarefa') && !filtro) return { erro: "Este tipo de meta precisa do cômodo/tarefa." };
  const raridade = RARIDADES.includes(d.raridade) ? d.raridade : "Comum";

  const { lista, colMap, rows } = await lerConquistasBrutas(sheets, spreadsheetId);
  if (lista.some(c => normTxt(c.titulo) === normTxt(titulo))) return { erro: "Já existe uma conquista com esse título." };

  let maxId = 1000;
  lista.forEach(c => { const n = parseInt(c.id, 10); if (!isNaN(n) && n > maxId) maxId = n; });

  // proxima linha livre: depois da ultima linha com dado (nunca append em "Aba!A")
  let ultima = LINHA_CABECALHO + 1;
  for (let i = rows.length - 1; i > LINHA_CABECALHO; i--) {
    if ((rows[i] || []).some(v => String(v || "").trim() !== "")) { ultima = i + 1; break; }
  }
  const proxima = ultima + 1;

  const valores = {
    "ID": maxId + 1, "Título": titulo, "Descrição": String(d.descricao || "").trim(),
    "Ícone": String(d.icone || "🏆").trim() || "🏆", "Raridade": raridade,
    "Tipo de Meta": TIPOS_META[tipoChave], "Filtro": filtro, "Meta": meta,
    "Progresso Atual": 0, "Status": "Bloqueada", "Data Conquista": ""
  };
  const ordem = COLS_CONQUISTAS.filter(n => colMap[n] !== undefined);
  const data = ordem.map(n => ({ range: `${ABA_CONQUISTAS}!${columnToLetter(colMap[n] + 1)}${proxima}`, values: [[valores[n]]] }));
  await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: 'RAW', data } });
  await formatarTabelaCompleta(sheets, spreadsheetId, ABA_CONQUISTAS);
  return { id: maxId + 1 };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  // ---- CORS ----
  // Lista de origens autorizadas a chamar esta API pelo navegador.
  // "Access-Control-Allow-Origin: *" junto com Credentials: true e invalido
  // pela spec, por isso devolvemos a origem exata que pediu (se estiver na lista).
  const ORIGENS_PERMITIDAS = [
    'https://home-limpeza.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];
  const origemReq = req.headers.origin || '';
  if (ORIGENS_PERMITIDAS.includes(origemReq)) {
    res.setHeader('Access-Control-Allow-Origin', origemReq);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // ---- Chave de acesso ----
  // Se a variavel API_KEY existir na Vercel, todo pedido precisa trazer
  // o header X-Api-Key igual a ela. Sem a variavel, a checagem e ignorada
  // (para nao quebrar o site caso a configuracao ainda nao tenha sido feita).
  const chaveEsperada = process.env.API_KEY;
  if (chaveEsperada) {
    const chaveRecebida = req.headers['x-api-key'];
    if (chaveRecebida !== chaveEsperada) {
      return res.status(401).json({ status: 'error', message: 'Não autorizado. Chave de acesso inválida.' });
    }
  }

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SPREADSHEET_ID;

    if (!spreadsheetId) {
      return res.status(500).json({ status: 'error', message: 'SPREADSHEET_ID is missing' });
    }

    if (req.method === 'GET') {
      if (String(req.query && req.query.conquistas || '') === '1') {
        const r = await avaliarConquistas(sheets, spreadsheetId);
        return res.status(200).json({ status: "success", ...r });
      }

      // Painel de exclusao: lista as linhas de uma aba (ou de todas)
      if (String(req.query && req.query.painel || '') === 'linhas') {
        const abaPedida = req.query.aba;
        const abas = abaPedida ? [abaPedida] : ABAS_PAINEL;

        const resultado = [];
        for (const nomeAba of abas) {
          if (!ABAS_PAINEL.includes(nomeAba)) continue;
          if (nomeAba === ABA_CONQUISTAS) await garantirAbaConquistas(sheets, spreadsheetId);
          const dados = await lerAbaParaPainel(sheets, spreadsheetId, nomeAba);
          resultado.push({
            aba: nomeAba,
            rotulo: ROTULO_ABA[nomeAba] || nomeAba,
            colunas: dados.colunas,
            linhas: dados.linhas
          });
        }

        return res.status(200).json({ status: "success", abas: resultado });
      }

      // As missoes do dia SO entram na planilha quando o usuario bate o ponto de ENTRADA.
      // Abrir o site nao lanca nada: primeiro le o ponto, depois decide.
      const progresso = await getSheetData(sheets, spreadsheetId, "Progresso Diário!A:Z");
      const turnos = await getSheetData(sheets, spreadsheetId, "Registro de Ponto!A:Z");
      const missoes = await getSheetData(sheets, spreadsheetId, "Missões!A:Z");

      const hojeStr = getDataHojeStr();
      let pontoAtivo = false;
      let horaEntradaMs = null;

      for (let i = turnos.length - 1; i >= 0; i--) {
        const t = turnos[i];
        if (normalizarData(t.data) === hojeStr) {
          const st = (t["Status do Turno"] || "").toUpperCase();
          const hs = t["Hora Saída"] || "";
          if (st === "EM SERVIÇO" || !hs) {
            pontoAtivo = true;
            const horaEnt = t["Hora Entrada"] || "";
            if (horaEnt) {
              const [d, m, y] = hojeStr.split('/');
              const [h, min, s] = horaEnt.split(':');
              horaEntradaMs = new Date(y, m - 1, d, h, min, s || 0).getTime();
            }
            break;
          }
        }
      }

      // Lanca as missoes do dia somente com turno aberto (ponto batido e nao encerrado).
      // Sem turno aberto nao mexe na aba Progresso Diario.
      if (pontoAtivo) {
        await sincronizarMissossDoDiaEmSegundoPlano(sheets, spreadsheetId);
      }

      const concluidasCount = progresso.filter(p => p.status === "Concluído").length;

      let cicloFolga = null;
      try {
        const cfg = await lerConfiguracoes(sheets, spreadsheetId);
        cicloFolga = calcularCicloFolga(cfg, turnos, hojeStr, progresso);
      } catch (eCiclo) {
        console.error("[GET] falha ao calcular ciclo de folga:", eCiclo && eCiclo.message);
      }

      return res.status(200).json({
        status: "success",
        // Sem nenhuma linha na aba Progresso Diario ainda, cai para o catalogo de
        // Missoes, senao a tela abre vazia e o modal de frequencias nao lista nada.
        missoes: progresso.length > 0 ? progresso : missoes,
        catalogo: missoes,
        turnos: turnos,
        pontoAtivo: pontoAtivo,
        horaEntradaMs: horaEntradaMs,
        cicloFolga: cicloFolga,
        estatisticas: { concluidas: concluidasCount }
      });
    }

    if (req.method === 'POST') {
      const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const acao = data.acao;
      const hojeStr = getDataHojeStr();

      if (acao === 'adicionarConquista') {
        const r = await adicionarConquista(sheets, spreadsheetId, data);
        if (r.erro) return res.status(400).json({ status: "error", message: r.erro });
        const av = await avaliarConquistas(sheets, spreadsheetId);
        return res.status(200).json({ status: "success", id: r.id, ...av });
      }

      if (acao === 'testarFolga') {
        const ativo = data.ativo === true;
        const cfgAtual = await salvarConfiguracoes(sheets, spreadsheetId, { modoTeste: ativo ? 'TRUE' : 'FALSE' });
        const turnosCfg = await getSheetData(sheets, spreadsheetId, "Registro de Ponto!A:Z");
        const progressoCfg = await getSheetData(sheets, spreadsheetId, "Progresso Diário!A:Z");
        return res.status(200).json({
          status: "success",
          cicloFolga: calcularCicloFolga(cfgAtual, turnosCfg, hojeStr, progressoCfg)
        });
      }

      if (acao === 'salvarConfigFolga') {
        const novoValor = parseInt(data.diasParaFolga, 10);
        if (!Number.isFinite(novoValor) || novoValor < 1 || novoValor > 365) {
          return res.status(400).json({ status: "error", message: "diasParaFolga deve ser um numero entre 1 e 365." });
        }
        const cfgAtual = await salvarConfiguracoes(sheets, spreadsheetId, { diasParaFolga: novoValor });
        const turnosCfg = await getSheetData(sheets, spreadsheetId, "Registro de Ponto!A:Z");
        const progressoCfg = await getSheetData(sheets, spreadsheetId, "Progresso Diário!A:Z");
        return res.status(200).json({
          status: "success",
          cicloFolga: calcularCicloFolga(cfgAtual, turnosCfg, hojeStr, progressoCfg)
        });
      }

      if (acao === 'resetarCicloFolga') {
        // Zera a contagem: a partir de hoje comeca um ciclo novo.
        const cfgAtual = await salvarConfiguracoes(sheets, spreadsheetId, { ultimaFolga: hojeStr, pularFolgaAte: "" });
        const turnosCfg = await getSheetData(sheets, spreadsheetId, "Registro de Ponto!A:Z");
        const progressoCfg = await getSheetData(sheets, spreadsheetId, "Progresso Diário!A:Z");
        return res.status(200).json({
          status: "success",
          cicloFolga: calcularCicloFolga(cfgAtual, turnosCfg, hojeStr, progressoCfg)
        });
      }

      if (acao === 'trabalharNaFolga') {
        // Decide trabalhar no dia de folga: empurra a folga para amanha.
        const amanha = new Date(parseDataPtBrParaMs(hojeStr) + 86400000);
        const amanhaStr = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(amanha);
        const cfgAtual = await salvarConfiguracoes(sheets, spreadsheetId, { pularFolgaAte: amanhaStr });
        const turnosCfg = await getSheetData(sheets, spreadsheetId, "Registro de Ponto!A:Z");
        const progressoCfg = await getSheetData(sheets, spreadsheetId, "Progresso Diário!A:Z");
        return res.status(200).json({
          status: "success",
          cicloFolga: calcularCicloFolga(cfgAtual, turnosCfg, hojeStr, progressoCfg)
        });
      }

      if (acao === 'baterPonto') {
        // Bater ponto encerra o modo teste: se voce decidiu trabalhar, o teste acabou.
        try {
          const cfgAntes = await lerConfiguracoes(sheets, spreadsheetId);
          const vt = cfgAntes.modoTeste;
          if (vt === true || String(vt || '').toUpperCase() === 'TRUE') {
            await salvarConfiguracoes(sheets, spreadsheetId, { modoTeste: 'FALSE' });
          }
        } catch (eT) {
          console.error("[baterPonto] falha ao encerrar modo teste:", eT && eT.message);
        }

        const resPonto = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Registro de Ponto!A:Z" });
        const pParsed = parseSheetRows(resPonto.data.values || []);
        const colMap = pParsed.colMap;

        if (data.status === 'ENTRADA') {
          let maxId = 999;
          pParsed.dataRows.forEach(r => {
            const idVal = parseInt(r[colMap["ID Turno"]], 10);
            if (!isNaN(idVal) && idVal > maxId) maxId = idVal;
          });
          const novoIdTurno = maxId + 1;
          const nextRow = (resPonto.data.values || []).length + 1;

          let maxColIndex = Math.max(...Object.values(colMap), 0);
          let rowArray = new Array(maxColIndex + 1).fill("");
          
          if (colMap["ID Turno"] !== undefined) rowArray[colMap["ID Turno"]] = novoIdTurno;
          if (colMap["Data"] !== undefined) rowArray[colMap["Data"]] = hojeStr;
          if (colMap["Hora Entrada"] !== undefined) rowArray[colMap["Hora Entrada"]] = data.horaExata || getHoraAtualStr();
          if (colMap["Hora Saída"] !== undefined) rowArray[colMap["Hora Saída"]] = "";
          if (colMap["Tempo Trabalhado"] !== undefined) rowArray[colMap["Tempo Trabalhado"]] = "";
          if (colMap["Créditos"] !== undefined) rowArray[colMap["Créditos"]] = "0s";
          if (colMap["Status do Turno"] !== undefined) rowArray[colMap["Status do Turno"]] = "Em Serviço";

          await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `Registro de Ponto!A${nextRow}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [rowArray] }
          });

          // Ponto batido: agora sim entram as missoes do dia.
          try {
            await sincronizarMissossDoDiaEmSegundoPlano(sheets, spreadsheetId);
          } catch (eSinc) {
            console.error("[baterPonto ENTRADA] falha ao lancar missoes:", eSinc && eSinc.message);
          }
        } else if (data.status === 'SAIDA') {
          const dadosPonto = await getSheetData(sheets, spreadsheetId, "Registro de Ponto!A:Z");
          let linhaTurno = -1;
          for (let i = dadosPonto.length - 1; i >= 0; i--) {
            const t = dadosPonto[i];
            const st = (t["Status do Turno"] || "").toUpperCase();
            const hs = t["Hora Saída"] || "";
            if ((normalizarData(t.data) === hojeStr || !t.data) && (st === "EM SERVIÇO" || !hs)) {
              linhaTurno = t._linha;
              break;
            }
          }
          if (linhaTurno === -1 && dadosPonto.length > 0) {
            const ultimo = dadosPonto[dadosPonto.length - 1];
            if (!ultimo["Hora Saída"] || (ultimo["Status do Turno"] || "").toUpperCase() === "EM SERVIÇO") {
              linhaTurno = ultimo._linha;
            }
          }

          if (linhaTurno !== -1) {
            const horaSaidaStr = data.horaExata || getHoraAtualStr();
            const turnoAlvo = dadosPonto.find(t => t._linha === linhaTurno);
            const horaEntradaStr = turnoAlvo ? (turnoAlvo["Hora Entrada"] || "00:00:00") : "00:00:00";
            
            const [he, me, se] = horaEntradaStr.split(':').map(Number);
            const [hs2, ms2, ss2] = horaSaidaStr.split(':').map(Number);
            
            const totalSegsTrabalho = (hs2 * 3600 + ms2 * 60 + (ss2 || 0)) - (he * 3600 + me * 60 + (se || 0));
            const segsTrabalhoVal = Math.max(0, totalSegsTrabalho);
            
            const horasTrab = String(Math.floor(segsTrabalhoVal / 3600)).padStart(2, '0');
            const minsTrab = String(Math.floor((segsTrabalhoVal % 3600) / 60)).padStart(2, '0');
            const segsTrab = String(segsTrabalhoVal % 60).padStart(2, '0');
            const tempoTrabalhadoFormatado = `${horasTrab}:${minsTrab}:${segsTrab}`;

            let dataUpdates = [];
            if (colMap["Hora Saída"] !== undefined) {
              dataUpdates.push({ range: `Registro de Ponto!${columnToLetter(colMap["Hora Saída"] + 1)}${linhaTurno}`, values: [[horaSaidaStr]] });
            }
            if (colMap["Status do Turno"] !== undefined) {
              dataUpdates.push({ range: `Registro de Ponto!${columnToLetter(colMap["Status do Turno"] + 1)}${linhaTurno}`, values: [["Encerrado"]] });
            }
            if (colMap["Tempo Trabalhado"] !== undefined) {
              dataUpdates.push({ range: `Registro de Ponto!${columnToLetter(colMap["Tempo Trabalhado"] + 1)}${linhaTurno}`, values: [[tempoTrabalhadoFormatado]] });
            }

            if (dataUpdates.length > 0) {
              await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                requestBody: { valueInputOption: 'USER_ENTERED', data: dataUpdates }
              });
            }
          }
        }

        await formatarTabelaCompleta(sheets, spreadsheetId, "Registro de Ponto");
        return res.status(200).json({ status: "success" });
      }

      if (acao === 'adicionarMissao') {
        // CORREÇÃO: Repetir/adicionar missão não deve criar nova linha na aba "Missões", apenas lançar no "Progresso Diário" (ou se for criada via interface do usuário explicitamente, mas aqui na sincronização e repetição tratamos de forma única).
        // Vamos verificar se a missão já existe na aba "Missões" antes de inserir, evitando duplicação na aba Missões.
        const missoesRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Missões!A:Z" });
        const mParsed = parseSheetRows(missoesRes.data.values || []);
        const mColMap = mParsed.colMap;

        const tituloDesejado = String(data.titulo || "").trim();
        const tituloDesejadoLower = tituloDesejado.toLowerCase();

        // Repeticao: nao cadastra na aba Missoes, lanca apenas no Progresso Diario.
        // Detectado de duas formas:
        //   1) o front envia data.repeticao === true
        //   2) o titulo ja vem com sufixo de repeticao (II, III, IV...)
        const sufixoRepeticao = /\s(I{2,3}|IV|VI{0,3}|IX|X)$/i.test(tituloDesejado);
        const ehRepeticao = data.repeticao === true || sufixoRepeticao;
        // Missao unica: existe so no dia (aba Progresso Diario). Nunca vai para a aba Missoes.
        const ehUnica = data.missaoUnica === true || data.unica === true;

        let missaoExistenteNaAba = (ehRepeticao || ehUnica) ? null
          : mParsed.dataRows.find(r => String(r[mColMap["Título da Missão"]] || "").trim().toLowerCase() === tituloDesejadoLower);

        if (!ehRepeticao && !ehUnica && !missaoExistenteNaAba) {
          // Só adiciona na aba Missões se realmente não existir nenhuma com esse nome (garantindo que missões repetidas sejam únicas)
          let maxIdMissao = 999;
          mParsed.dataRows.forEach(r => {
            let idVal = parseInt(r[mColMap["ID"]], 10);
            if (!isNaN(idVal) && idVal > maxIdMissao) maxIdMissao = idVal;
          });
          const novoIdBase = maxIdMissao + 1;
          const nextRowMissao = (missoesRes.data.values || []).length + 1;

          let maxColM = Math.max(...Object.values(mColMap), 0);
          let rowArrayM = new Array(maxColM + 1).fill("");
          if (mColMap["ID"] !== undefined) rowArrayM[mColMap["ID"]] = novoIdBase;
          if (mColMap["Título da Missão"] !== undefined) rowArrayM[mColMap["Título da Missão"]] = data.titulo;
          if (mColMap["Cômodo"] !== undefined) rowArrayM[mColMap["Cômodo"]] = data.comodo;
          // "Tempo Médio (Minutos)" tem formula (MAP/LAMBDA) e NAO deve ser escrito.
          // O tempo informado vai sempre para "Tempo Estimado (Minutos)".
          if (mColMap["Tempo Estimado (Minutos)"] !== undefined) rowArrayM[mColMap["Tempo Estimado (Minutos)"]] = data.tempoEstimado;
          else if (mColMap["Tempo Est. (min)"] !== undefined) rowArrayM[mColMap["Tempo Est. (min)"]] = data.tempoEstimado;
          if (mColMap["Frequência (Dias)"] !== undefined) rowArrayM[mColMap["Frequência (Dias)"]] = data.frequenciaDias || 1;
          if (mColMap["Prioridade"] !== undefined) rowArrayM[mColMap["Prioridade"]] = data.prioridade;

          await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `Missões!A${nextRowMissao}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [rowArrayM] }
          });
          await formatarTabelaCompleta(sheets, spreadsheetId, "Missões");
        }

        const progRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Progresso Diário!A:Z" });
        const pParsed = parseSheetRows(progRes.data.values || []);
        const pColMap = pParsed.colMap;

        // Verificar se já existe no Progresso Diário para o dia atual para evitar duplicatas
        const dataAlvo = data.data || hojeStr;
        const jaExisteProgresso = pParsed.dataRows.some(r => {
          return normalizarData(r[pColMap["Data"]]) === normalizarData(dataAlvo) &&
                 String(r[pColMap["Título da Missão"]] || "").trim().toLowerCase() === tituloDesejadoLower;
        });

        if (jaExisteProgresso) {
          return res.status(200).json({ status: "success", message: "Missão já existe no progresso diário de hoje." });
        }

        let maxIdProg = 999;
        pParsed.dataRows.forEach(r => {
          let idVal = parseInt(r[pColMap["ID"]], 10);
          if (!isNaN(idVal) && idVal > maxIdProg) maxIdProg = idVal;
        });
        const novoIdProg = maxIdProg + 1;
        const nextRowProg = (progRes.data.values || []).length + 1;

        let maxColP = Math.max(...Object.values(pColMap), 0);
        let rowArrayP = new Array(maxColP + 1).fill("");
        if (pColMap["ID"] !== undefined) rowArrayP[pColMap["ID"]] = novoIdProg;
        if (pColMap["Data"] !== undefined) rowArrayP[pColMap["Data"]] = dataAlvo;
        if (pColMap["Título da Missão"] !== undefined) rowArrayP[pColMap["Título da Missão"]] = data.titulo;
        if (pColMap["Cômodo"] !== undefined) rowArrayP[pColMap["Cômodo"]] = data.comodo;
        if (pColMap["Tempo Estimado (Minutos)"] !== undefined) rowArrayP[pColMap["Tempo Estimado (Minutos)"]] = data.tempoEstimado;
        else if (pColMap["Tempo Est. (min)"] !== undefined) rowArrayP[pColMap["Tempo Est. (min)"]] = data.tempoEstimado;
        if (pColMap["Frequência (Dias)"] !== undefined) rowArrayP[pColMap["Frequência (Dias)"]] = data.frequenciaDias || 1;
        if (pColMap["Prioridade"] !== undefined) rowArrayP[pColMap["Prioridade"]] = data.prioridade;
        if (pColMap["Status"] !== undefined) rowArrayP[pColMap["Status"]] = "Pendente";

        try {
          await sheets.spreadsheets.values.append({
            spreadsheetId,
            range: `Progresso Diário!A${nextRowProg}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [rowArrayP] }
          });
        } catch (errAppend) {
          console.error('[adicionarMissao] ERRO no append:', errAppend.message, errAppend.response && errAppend.response.data);
          throw errAppend;
        }

        await formatarTabelaCompleta(sheets, spreadsheetId, "Progresso Diário");
        return res.status(200).json({ status: "success", id: novoIdProg });
      }

      if (acao === 'editarMissao') {
        const tituloBusca = String(data.tituloOriginal || data.titulo).trim().toLowerCase();

        const missoesRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Missões!A:Z" });
        const mParsed = parseSheetRows(missoesRes.data.values || []);
        const mColMap = mParsed.colMap;
        const mDataRows = mParsed.dataRows;

        let mLinhaAlvo = -1;
        mDataRows.forEach((row, idx) => {
          const tVal = String(row[mColMap["Título da Missão"]] || "").trim().toLowerCase();
          if (tVal === tituloBusca) {
            mLinhaAlvo = idx + (missoesRes.data.values.length - mDataRows.length + 1);
          }
        });

        if (mLinhaAlvo !== -1) {
          let mUpdates = [];
          if (data.titulo && mColMap["Título da Missão"] !== undefined) mUpdates.push({ range: `Missões!${columnToLetter(mColMap["Título da Missão"] + 1)}${mLinhaAlvo}`, values: [[data.titulo]] });
          if (data.comodo && mColMap["Cômodo"] !== undefined) mUpdates.push({ range: `Missões!${columnToLetter(mColMap["Cômodo"] + 1)}${mLinhaAlvo}`, values: [[data.comodo]] });
          if (data.tempoEstimado !== undefined) {
            // "Tempo Médio (Minutos)" tem formula (MAP/LAMBDA) e NAO deve ser escrito.
            const colTempoEst = mColMap["Tempo Estimado (Minutos)"] !== undefined ? mColMap["Tempo Estimado (Minutos)"] : mColMap["Tempo Est. (min)"];
            if (colTempoEst !== undefined) mUpdates.push({ range: `Missões!${columnToLetter(colTempoEst + 1)}${mLinhaAlvo}`, values: [[data.tempoEstimado]] });
          }
          if (data.prioridade && mColMap["Prioridade"] !== undefined) mUpdates.push({ range: `Missões!${columnToLetter(mColMap["Prioridade"] + 1)}${mLinhaAlvo}`, values: [[data.prioridade]] });

          if (mUpdates.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
              spreadsheetId,
              requestBody: { valueInputOption: 'USER_ENTERED', data: mUpdates }
            });
          }
        }

        const progRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Progresso Diário!A:Z" });
        const pParsed = parseSheetRows(progRes.data.values || []);
        const pColMap = pParsed.colMap;
        const pDataRows = pParsed.dataRows;

        const candidatas = pDataRows.map((row, idx) => ({ row, linha: idx + pParsed.headerRowIndex + 2 }))
          .filter(({ row }) => String(row[pColMap['ID']]) === String(data.id) && normalizarData(row[pColMap['Data']]) === normalizarData(data.data || hojeStr));
        const pLinhaAlvo = candidatas.length === 1 ? candidatas[0].linha : -1;

        if (pLinhaAlvo !== -1) {
          let pUpdates = [];
          if (data.titulo && pColMap["Título da Missão"] !== undefined) pUpdates.push({ range: `Progresso Diário!${columnToLetter(pColMap["Título da Missão"] + 1)}${pLinhaAlvo}`, values: [[data.titulo]] });
          if (data.comodo && pColMap["Cômodo"] !== undefined) pUpdates.push({ range: `Progresso Diário!${columnToLetter(pColMap["Cômodo"] + 1)}${pLinhaAlvo}`, values: [[data.comodo]] });
          if (data.tempoEstimado !== undefined) {
            const colTempoP = pColMap["Tempo Estimado (Minutos)"] !== undefined ? pColMap["Tempo Estimado (Minutos)"] : pColMap["Tempo Est. (min)"];
            if (colTempoP !== undefined) pUpdates.push({ range: `Progresso Diário!${columnToLetter(colTempoP + 1)}${pLinhaAlvo}`, values: [[data.tempoEstimado]] });
          }
          if (data.prioridade && pColMap["Prioridade"] !== undefined) pUpdates.push({ range: `Progresso Diário!${columnToLetter(pColMap["Prioridade"] + 1)}${pLinhaAlvo}`, values: [[data.prioridade]] });

          if (pUpdates.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
              spreadsheetId,
              requestBody: { valueInputOption: 'USER_ENTERED', data: pUpdates }
            });
          }
        }

        return res.status(200).json({ status: "success" });
      }

      if (acao === 'editarFrequencia') {
        const tituloBusca = String(data.titulo || "").trim().toLowerCase();
        const novaFreq = parseInt(data.frequenciaDias, 10) || 1;

        const missoesRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Missões!A:Z" });
        const mParsed = parseSheetRows(missoesRes.data.values || []);
        const mColMap = mParsed.colMap;
        const mDataRows = mParsed.dataRows;

        // Duas missoes podem ter o MESMO titulo em comodos diferentes
        // ("Juntar o lixo" no Quarto e no Banheiro). O comodo desempata.
        const comodoBusca = String(data.comodo || "").trim().toLowerCase();
        let mLinhaAlvo = -1;
        let mIdxAlvo = -1;
        mDataRows.forEach((row, idx) => {
          const tVal = String(row[mColMap["Título da Missão"]] || "").trim().toLowerCase();
          if (tVal !== tituloBusca) return;
          if (comodoBusca && mColMap["Cômodo"] !== undefined) {
            const cVal = String(row[mColMap["Cômodo"]] || "").trim().toLowerCase();
            if (cVal !== comodoBusca) return;
          }
          mIdxAlvo = idx;
          mLinhaAlvo = idx + (missoesRes.data.values.length - mDataRows.length + 1);
        });

        if (mLinhaAlvo === -1) {
          return res.status(409).json({ status: "error", message: "Missão não encontrada na aba Missões." });
        }

        if (mColMap["Frequência (Dias)"] !== undefined) {
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `Missões!${columnToLetter(mColMap["Frequência (Dias)"] + 1)}${mLinhaAlvo}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[novaFreq]] }
          });
        }

        // A missao de HOJE tambem existe na aba Progresso Diario, com a frequencia
        // copiada no lancamento. Sem atualizar la tambem, o app volta a mostrar
        // a frequencia antiga e o valor gravado em Missoes nao aparece.
        const comodoAlvo = mColMap["Cômodo"] !== undefined
          ? String(mDataRows[mIdxAlvo][mColMap["Cômodo"]] || "").trim().toLowerCase()
          : "";
        const progRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Progresso Diário!A:Z" });
        const pRows = progRes.data.values || [];
        const pParsed = parseSheetRows(pRows);
        const pColMap = pParsed.colMap;
        const colFreqP = pColMap["Frequência (Dias)"];
        const colTitP = pColMap["Título da Missão"];
        const colComP = pColMap["Cômodo"];
        const colStP = pColMap["Status"];

        if (colFreqP !== undefined && colTitP !== undefined) {
          const updates = [];
          pParsed.dataRows.forEach((row, idx) => {
            if (String(row[colTitP] || "").trim().toLowerCase() !== tituloBusca) return;
            if (comodoAlvo && colComP !== undefined && String(row[colComP] || "").trim().toLowerCase() !== comodoAlvo) return;
            // nao mexe no historico: so linhas que ainda nao foram concluidas/canceladas
            if (colStP !== undefined) {
              const st = normalizarStatusMissao(row[colStP]);
              if (st === 'Concluído' || st === 'Cancelado') return;
            }
            const linhaReal = idx + pParsed.headerRowIndex + 2;
            updates.push({ range: `Progresso Diário!${columnToLetter(colFreqP + 1)}${linhaReal}`, values: [[novaFreq]] });
          });
          if (updates.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
              spreadsheetId,
              requestBody: { valueInputOption: 'USER_ENTERED', data: updates }
            });
          }
        }

        return res.status(200).json({ status: "success", atualizou: true, linha: mLinhaAlvo });
      }

      if (acao === 'salvarOrdem') {
        // Reordena as linhas da aba "Missões" na ordem enviada, reescrevendo o
        // bloco inteiro de uma vez. Nao cria coluna nenhuma: a ordem E a posicao
        // da linha na planilha.
        // data.itens = [{ titulo, comodo }, ...] na ordem desejada
        const itens = Array.isArray(data.itens) ? data.itens : [];
        if (itens.length === 0) {
          return res.status(400).json({ status: 'error', message: 'Nenhuma missão informada.' });
        }

        const missoesRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Missões!A:Z" });
        const mParsed = parseSheetRows(missoesRes.data.values || []);
        const mColMap = mParsed.colMap;
        const colTitulo = mColMap["Título da Missão"];
        const colComodo = mColMap["Cômodo"];
        if (colTitulo === undefined) {
          return res.status(400).json({ status: 'error', message: 'Coluna "Título da Missão" não encontrada.' });
        }

        const largura = Math.max(
          ...mParsed.dataRows.map(r => r.length),
          ...Object.values(mColMap).map(n => n + 1),
          1
        );
        const chave = (t, c) => String(t || '').trim().toLowerCase() + '||' + String(c || '').trim().toLowerCase();

        // Cada item pedido puxa a sua linha da planilha (na ordem em que veio).
        const usadas = new Set();
        const ordenadas = [];
        itens.forEach(item => {
          const k = chave(item.titulo, item.comodo);
          const idx = mParsed.dataRows.findIndex((row, i) => {
            if (usadas.has(i)) return false;
            const mesmoTitulo = String(row[colTitulo] || '').trim().toLowerCase() === String(item.titulo || '').trim().toLowerCase();
            if (!mesmoTitulo) return false;
            if (colComodo === undefined) return true;
            return chave(row[colTitulo], row[colComodo]) === k;
          });
          if (idx === -1) return;
          usadas.add(idx);
          ordenadas.push(mParsed.dataRows[idx]);
        });

        // O que nao veio no pedido (missao criada em outra aba aberta) fica no fim.
        mParsed.dataRows.forEach((row, i) => { if (!usadas.has(i)) ordenadas.push(row); });

        if (ordenadas.length === 0) {
          return res.status(400).json({ status: 'error', message: 'Nenhuma missão encontrada na planilha.' });
        }

        const linhas = ordenadas.map(row => {
          const arr = Array.from({ length: largura }, (_, i) => row[i] !== undefined ? row[i] : "");
          return arr;
        });

        const primeiraLinha = mParsed.headerRowIndex + 2;
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `Missões!A${primeiraLinha}`,
          valueInputOption: 'RAW',
          requestBody: { values: linhas }
        });

        // A coluna "Ordem" (criada na versao anterior) sai: a ordem agora e a posicao.
        // Ela e a ULTIMA coluna, entao apagar a coluna nao desalinha os dados.
        const ultimaCol = Math.max(...Object.values(mColMap));
        if (mColMap["Ordem"] !== undefined && mColMap["Ordem"] === ultimaCol) {
          try {
            const sheetIdRes = await sheets.spreadsheets.get({ spreadsheetId, fields: 'sheets(properties(sheetId,title))' });
            const aba = (sheetIdRes.data.sheets || []).find(s => s.properties && s.properties.title === "Missões");
            if (aba) {
              await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: {
                  requests: [{ deleteDimension: { range: { sheetId: aba.properties.sheetId, dimension: 'COLUMNS', startIndex: mColMap["Ordem"], endIndex: mColMap["Ordem"] + 1 } } }]
                }
              });
            }
          } catch (eDel) {
            console.error("[salvarOrdem] nao consegui remover a coluna Ordem:", eDel && eDel.message);
          }
        }

        return res.status(200).json({ status: "success", reordenadas: linhas.length });
      }

      if (acao === 'excluirLinhas') {
        // data.itens = [{ aba: "Missões", linha: 12 }, ...]
        const itens = Array.isArray(data.itens) ? data.itens : [];
        if (itens.length === 0) {
          return res.status(400).json({ status: 'error', message: 'Nenhuma linha informada.' });
        }

        const meta = await sheets.spreadsheets.get({ spreadsheetId });

        // Agrupa por aba para montar os ranges de exclusao
        const porAba = {};
        for (const item of itens) {
          const nomeAba = String(item.aba || '').trim();
          const linha = parseInt(item.linha, 10);
          if (!ABAS_PAINEL.includes(nomeAba)) continue;
          if (!Number.isFinite(linha) || linha < 3) continue; // nunca apaga cabecalho
          if (!porAba[nomeAba]) porAba[nomeAba] = new Set();
          porAba[nomeAba].add(linha);
        }

        const requests = [];
        const resumo = [];

        for (const nomeAba of Object.keys(porAba)) {
          const sheet = meta.data.sheets.find(s => s.properties.title === nomeAba);
          if (!sheet) continue;
          const sheetId = sheet.properties.sheetId;

          // Ordena do MAIOR para o MENOR: apagar de baixo para cima
          // evita que uma exclusao desloque a linha seguinte.
          const linhas = Array.from(porAba[nomeAba]).sort((a, b) => b - a);

          // Junta linhas consecutivas num unico range, para gastar menos requests
          const ranges = [];
          let atual = null;
          for (const linha of linhas) {
            if (atual && atual.startIndex === linha) {
              atual.startIndex = linha - 1;
            } else {
              if (atual) ranges.push(atual);
              atual = { startIndex: linha - 1, endIndex: linha };
            }
          }
          if (atual) ranges.push(atual);

          for (const r of ranges) {
            requests.push({
              deleteDimension: {
                range: { sheetId, dimension: "ROWS", startIndex: r.startIndex, endIndex: r.endIndex }
              }
            });
          }

          resumo.push({ aba: nomeAba, linhasRemovidas: linhas.length });
        }

        if (requests.length === 0) {
          return res.status(400).json({ status: 'error', message: 'Nenhuma linha válida para excluir.' });
        }

        await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });

        // Reaplica o formato nas abas afetadas
        for (const nomeAba of Object.keys(porAba)) {
          try { await formatarTabelaCompleta(sheets, spreadsheetId, nomeAba); } catch (e) { /* segue */ }
        }

        return res.status(200).json({ status: "success", resumo });
      }

      if (acao === 'excluirMissao') {
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        const sheetProgresso = meta.data.sheets.find(s => s.properties.title === "Progresso Diário");
        const sheetMissoes = meta.data.sheets.find(s => s.properties.title === "Missões");

        const progRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Progresso Diário!A:Z" });
        const pParsed = parseSheetRows(progRes.data.values || []);
        const pColMap = pParsed.colMap;

        let pLinhaAlvo = -1;
        let tituloMissao = "";
        pParsed.dataRows.forEach((row, idx) => {
          if (String(row[pColMap["ID"]]) === String(data.id)) {
            pLinhaAlvo = idx + pParsed.headerRowIndex + 2;
            tituloMissao = String(row[pColMap["Título da Missão"]] || "").trim();
          }
        });

        if (pLinhaAlvo === -1) {
          return res.status(404).json({ status: 'error', message: 'Missão não encontrada no Progresso Diário.' });
        }

        // 1. Localiza o cadastro correspondente na aba Missões, pelo titulo
        const missoesRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Missões!A:Z" });
        const mParsed = parseSheetRows(missoesRes.data.values || []);
        const mColMap = mParsed.colMap;

        let mLinhaAlvo = -1;
        if (tituloMissao && mColMap["Título da Missão"] !== undefined) {
          const tituloBusca = tituloMissao.toLowerCase();
          mParsed.dataRows.forEach((row, idx) => {
            const tVal = String(row[mColMap["Título da Missão"]] || "").trim().toLowerCase();
            if (tVal === tituloBusca) {
              mLinhaAlvo = idx + mParsed.headerRowIndex + 2;
            }
          });
        }

        // 2. Remove do Progresso Diario e de Missoes na mesma chamada.
        //    Indices de exclusao sao 0-based e ordenados do maior para o menor,
        //    para que apagar uma linha nao desloque a outra.
        const alvos = [];
        if (sheetProgresso) alvos.push({ sheetId: sheetProgresso.properties.sheetId, linha: pLinhaAlvo });
        if (mLinhaAlvo !== -1 && sheetMissoes) alvos.push({ sheetId: sheetMissoes.properties.sheetId, linha: mLinhaAlvo });
        alvos.sort((a, b) => b.linha - a.linha);

        const requests = alvos.map(a => ({
          deleteDimension: {
            range: { sheetId: a.sheetId, dimension: "ROWS", startIndex: a.linha - 1, endIndex: a.linha }
          }
        }));

        await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });

        await formatarTabelaCompleta(sheets, spreadsheetId, "Missões");
        await formatarTabelaCompleta(sheets, spreadsheetId, "Progresso Diário");
        return res.status(200).json({
          status: "success",
          removidoDoProgresso: true,
          removidoDoCadastro: mLinhaAlvo !== -1
        });
      }

      if (acao === 'atualizarEstadoMissao' || acao === 'concluirMissao') {
        const dados = await getSheetData(sheets, spreadsheetId, "Progresso Diário!A:Z");
        const progRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Progresso Diário!A:Z" });
        const pParsed = parseSheetRows(progRes.data.values || []);
        const colMap = pParsed.colMap;

        const missaoAlvo = selecionarMissao(dados, data, hojeStr);
        if (!missaoAlvo) {
          return res.status(409).json({ status: 'error', message: 'Missão não encontrada ou ID/data ambíguos.' });
        }
        if (missaoAlvo.status === 'Concluído') {
          return res.status(200).json({ status: 'success', jaConcluida: true });
        }

        const linha = missaoAlvo._linha;
        let dataUpdates = [];

        if (data.estadoMissao === 'EmAndamento') {
          if (colMap["Status"] !== undefined) dataUpdates.push({ range: `Progresso Diário!${columnToLetter(colMap["Status"] + 1)}${linha}`, values: [["Em Andamento"]] });
          if (data.horaExata && colMap["Hora de Início"] !== undefined) {
            dataUpdates.push({ range: `Progresso Diário!${columnToLetter(colMap["Hora de Início"] + 1)}${linha}`, values: [[data.horaExata]] });
          }
        } else if (acao === 'concluirMissao') {
          if (colMap["Status"] !== undefined) dataUpdates.push({ range: `Progresso Diário!${columnToLetter(colMap["Status"] + 1)}${linha}`, values: [["Concluído"]] });
          
          const horaTerminoStr = data.horaExata || getHoraAtualStr();
          if (colMap["Hora de Término"] !== undefined) {
            dataUpdates.push({ range: `Progresso Diário!${columnToLetter(colMap["Hora de Término"] + 1)}${linha}`, values: [[horaTerminoStr]] });
          }

          if (colMap["Hora de Início"] !== undefined && data.horaInicio && !missaoAlvo["Hora de Início"]) {
            dataUpdates.push({ range: `Progresso Diário!${columnToLetter(colMap["Hora de Início"] + 1)}${linha}`, values: [[data.horaInicio]] });
          }
        } else if (data.estadoMissao === 'Cancelado') {
          if (colMap["Status"] !== undefined) dataUpdates.push({ range: `Progresso Diário!${columnToLetter(colMap["Status"] + 1)}${linha}`, values: [["Cancelado"]] });
        }

        if (dataUpdates.length > 0) {
          await sheets.spreadsheets.values.batchUpdate({
            spreadsheetId,
            requestBody: { valueInputOption: 'RAW', data: dataUpdates }
          });
        }

        return res.status(200).json({ status: "success" });
      }

      return res.status(400).json({ status: "error", message: "Ação desconhecida" });
    }

    res.status(405).json({ status: "error", message: "Method not allowed" });
  } catch (error) {
    console.error("ERRO CRITICO API:", error);
    res.status(500).json({ status: "error", message: error.toString() });
  }
}