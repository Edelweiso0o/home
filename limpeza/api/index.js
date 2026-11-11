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
const ABAS_PAINEL = ["Missões", "Progresso Diário", "Registro de Ponto"];

// Titulo amigavel de cada aba, para o front nao precisar traduzir.
const ROTULO_ABA = {
  "Missões": "Missões",
  "Progresso Diário": "Progresso Diário",
  "Registro de Ponto": "Registro de Ponto"
};

// Colunas que devem aparecer na previa de cada aba.
const COLUNAS_PREVIA = {
  "Missões": ["ID", "Título da Missão", "Cômodo", "Tempo Estimado (Minutos)", "Frequência (Dias)", "Prioridade"],
  "Progresso Diário": ["ID", "Data", "Título da Missão", "Cômodo", "Status", "Hora de Início", "Hora de Término"],
  "Registro de Ponto": ["ID Turno", "Data", "Hora Entrada", "Hora Saída", "Tempo Trabalhado", "Status do Turno"]
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
    obj.status = obj["Status"] !== undefined ? normalizarStatusMissao(obj["Status"]) : obj["Status do Turno"] || "";
    if (obj["Status"] !== undefined) obj["Status"] = obj.status;
    return obj;
  });
}

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
    const endRowIndex = rows.length; 
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

    requests.push({
      updateBorders: {
        range: { sheetId, startRowIndex, endRowIndex, startColumnIndex, endColumnIndex },
        top:    { style: "SOLID_MEDIUM", color: { red: 0, green: 0, blue: 0 } },
        bottom: { style: "SOLID_MEDIUM", color: { red: 0, green: 0, blue: 0 } },
        left:   { style: "SOLID_MEDIUM", color: { red: 0, green: 0, blue: 0 } },
        right:  { style: "SOLID_MEDIUM", color: { red: 0, green: 0, blue: 0 } }
      }
    });

    if (endRowIndex > startRowIndex + 1) {
      requests.push({
        updateBorders: {
          range: { sheetId, startRowIndex: startRowIndex + 1, endRowIndex, startColumnIndex, endColumnIndex },
          innerHorizontal: { style: "SOLID", color: { red: 1, green: 0.5, blue: 0 } },
          innerVertical:   { style: "SOLID", color: { red: 1, green: 0.5, blue: 0 } }
        }
      });
    }

    requests.push({
      updateBorders: {
        range: { sheetId, startRowIndex, endRowIndex: startRowIndex + 1, startColumnIndex, endColumnIndex },
        bottom: { style: "SOLID_MEDIUM", color: { red: 0, green: 0, blue: 0 } },
        innerVertical: { style: "SOLID", color: { red: 0, green: 0, blue: 0 } }
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
function contarDiasTrabalhados(turnos, referenciaStr) {
  const refMs = referenciaStr ? parseDataPtBrParaMs(referenciaStr) : 0;
  const dias = new Set();
  (turnos || []).forEach(t => {
    const dataNorm = normalizarData(t.data);
    if (!dataNorm) return;
    const ms = parseDataPtBrParaMs(dataNorm);
    if (!ms) return;
    if (refMs && ms <= refMs) return;
    dias.add(dataNorm);
  });
  return dias.size;
}

// Devolve o estado do ciclo de folga para hoje.
// Usa "ultimaFolga" (data) como marco zero; sem ela, conta todos os dias trabalhados.
function calcularCicloFolga(cfg, turnos, hojeStr) {
  const diasParaFolga = parseInt(cfg.diasParaFolga, 10) || CONFIG_PADRAO.diasParaFolga;
  const ultimaFolga = cfg.ultimaFolga ? normalizarData(cfg.ultimaFolga) : "";

  const trabalhouHoje = (turnos || []).some(t => normalizarData(t.data) === hojeStr);
  const diasTrabalhados = contarDiasTrabalhados(turnos, ultimaFolga);

  // "pularFolgaAte": se voce decidiu trabalhar no dia de folga, a folga
  // e empurrada para depois dessa data.
  const pularAte = cfg.pularFolgaAte ? normalizarData(cfg.pularFolgaAte) : "";
  const hojeMs = parseDataPtBrParaMs(hojeStr);
  const puladaHoje = pularAte && parseDataPtBrParaMs(pularAte) >= hojeMs;

  const ehFolgaHoje = !puladaHoje && diasTrabalhados >= diasParaFolga && !trabalhouHoje;
  const faltam = Math.max(0, diasParaFolga - diasTrabalhados);

  return {
    diasParaFolga: diasParaFolga,
    diasTrabalhados: diasTrabalhados,
    faltam: faltam,
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
      const ciclo = calcularCicloFolga(cfg, turnosParaCiclo, hojeStr);
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
    const titulosAdicionadosHoje = new Set(missoesHojeNaPlanilha.map(r => String(r[pColMap["Título da Missão"]] || "").trim().toLowerCase()));

    mParsed.dataRows.forEach(mRow => {
      let titulo = mRow[mColMap["Título da Missão"]] || "";
      let comodo = mRow[mColMap["Cômodo"]] || "";
      let tempoMedio = mRow[mColMap["Tempo Médio (Minutos)"]] || "";
      let prioridade = mRow[mColMap["Prioridade"]] || "Média";
      let frequenciaDias = parseInt(mRow[mColMap["Frequência (Dias)"]] || 1, 10) || 1;

      if (titulo) {
        const tituloLower = String(titulo).trim().toLowerCase();
        if (!titulosAdicionadosHoje.has(tituloLower)) {
          let ultimaConclusaoMs = 0;
          let ultimoTempoUsado = "";

          pData.forEach(pRow => {
            const tVal = pRow[pColMap["Título da Missão"]] || "";
            const stVal = normalizarStatusMissao(pRow[pColMap["Status"]]);
            const dataVal = pRow[pColMap["Data"]] || "";
            if (String(tVal).trim().toLowerCase() === tituloLower && stVal === 'Concluído') {
              const dMs = parseDataPtBrParaMs(dataVal);
              if (dMs >= ultimaConclusaoMs) {
                ultimaConclusaoMs = dMs;
                const tempoProg = pRow[pColMap["Tempo Estimado (Minutos)"]] || pRow[pColMap["Tempo Est. (min)"]] || "";
                if (tempoProg !== "") {
                  ultimoTempoUsado = tempoProg;
                }
              }
            }
          });

          // Definir o tempo: prioriza o tempo da última vez feita, senão pega direto da coluna "Tempo Médio (Minutos)" da aba Missões
          let tempoParaLancar = "";
          if (ultimoTempoUsado !== "") {
            tempoParaLancar = ultimoTempoUsado;
          } else {
            const tMedioNum = parseFloat(tempoMedio);
            if (!isNaN(tMedioNum) && tMedioNum > 0) {
              tempoParaLancar = tMedioNum;
            } else {
              const tempoEst = mRow[mColMap["Tempo Estimado (Minutos)"]] || mRow[mColMap["Tempo Est. (min)"]] || "";
              tempoParaLancar = tempoEst || 15;
            }
          }

          let deveLancar = true;
          if (ultimaConclusaoMs > 0 && frequenciaDias > 1) {
            const diffDias = Math.round((hojeMs - ultimaConclusaoMs) / (1000 * 60 * 60 * 24));
            if (diffDias < frequenciaDias) {
              deveLancar = false;
            }
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

            newRows.push(rowArray);
            titulosAdicionadosHoje.add(tituloLower);
            currentId++;
          }
        }
      }
    });

    if (newRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `Progresso Diário!A${nextRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: newRows }
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
      // Painel de exclusao: lista as linhas de uma aba (ou de todas)
      if (String(req.query && req.query.painel || '') === 'linhas') {
        const abaPedida = req.query.aba;
        const abas = abaPedida ? [abaPedida] : ABAS_PAINEL;

        const resultado = [];
        for (const nomeAba of abas) {
          if (!ABAS_PAINEL.includes(nomeAba)) continue;
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

      await sincronizarMissossDoDiaEmSegundoPlano(sheets, spreadsheetId);

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

      const concluidasCount = progresso.filter(p => p.status === "Concluído").length;

      let cicloFolga = null;
      try {
        const cfg = await lerConfiguracoes(sheets, spreadsheetId);
        cicloFolga = calcularCicloFolga(cfg, turnos, hojeStr);
      } catch (eCiclo) {
        console.error("[GET] falha ao calcular ciclo de folga:", eCiclo && eCiclo.message);
      }

      return res.status(200).json({
        status: "success",
        missoes: progresso.length > 0 ? progresso : missoes,
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

      if (acao === 'salvarConfigFolga') {
        const novoValor = parseInt(data.diasParaFolga, 10);
        if (!Number.isFinite(novoValor) || novoValor < 1 || novoValor > 365) {
          return res.status(400).json({ status: "error", message: "diasParaFolga deve ser um numero entre 1 e 365." });
        }
        const cfgAtual = await salvarConfiguracoes(sheets, spreadsheetId, { diasParaFolga: novoValor });
        const turnosCfg = await getSheetData(sheets, spreadsheetId, "Registro de Ponto!A:Z");
        return res.status(200).json({
          status: "success",
          cicloFolga: calcularCicloFolga(cfgAtual, turnosCfg, hojeStr)
        });
      }

      if (acao === 'resetarCicloFolga') {
        // Zera a contagem: a partir de hoje comeca um ciclo novo.
        const cfgAtual = await salvarConfiguracoes(sheets, spreadsheetId, { ultimaFolga: hojeStr, pularFolgaAte: "" });
        const turnosCfg = await getSheetData(sheets, spreadsheetId, "Registro de Ponto!A:Z");
        return res.status(200).json({
          status: "success",
          cicloFolga: calcularCicloFolga(cfgAtual, turnosCfg, hojeStr)
        });
      }

      if (acao === 'trabalharNaFolga') {
        // Decide trabalhar no dia de folga: empurra a folga para amanha.
        const amanha = new Date(parseDataPtBrParaMs(hojeStr) + 86400000);
        const amanhaStr = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(amanha);
        const cfgAtual = await salvarConfiguracoes(sheets, spreadsheetId, { pularFolgaAte: amanhaStr });
        const turnosCfg = await getSheetData(sheets, spreadsheetId, "Registro de Ponto!A:Z");
        return res.status(200).json({
          status: "success",
          cicloFolga: calcularCicloFolga(cfgAtual, turnosCfg, hojeStr)
        });
      }

      if (acao === 'baterPonto') {
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

        let missaoExistenteNaAba = ehRepeticao ? null
          : mParsed.dataRows.find(r => String(r[mColMap["Título da Missão"]] || "").trim().toLowerCase() === tituloDesejadoLower);

        if (!ehRepeticao && !missaoExistenteNaAba) {
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

        let mLinhaAlvo = -1;
        mDataRows.forEach((row, idx) => {
          const tVal = String(row[mColMap["Título da Missão"]] || "").trim().toLowerCase();
          if (tVal === tituloBusca) {
            mLinhaAlvo = idx + (missoesRes.data.values.length - mDataRows.length + 1);
          }
        });

        if (mLinhaAlvo !== -1 && mColMap["Frequência (Dias)"] !== undefined) {
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `Missões!${columnToLetter(mColMap["Frequência (Dias)"] + 1)}${mLinhaAlvo}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [[novaFreq]] }
          });
        }

        return res.status(200).json({ status: "success" });
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