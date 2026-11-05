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

function columnToLetter(column) {
  let temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}

// Encontra dinamicamente a linha do cabeçalho e mapeia as colunas corretamente
function parseSheetRows(rows) {
  if (!rows || rows.length === 0) return { headerRowIndex: -1, colMap: {}, dataRows: [] };

  let headerRowIndex = -1;
  let colMap = {};

  // Procura nas primeiras 5 linhas qual delas contém palavras-chave conhecidas
  for (let i = 0; i < Math.min(rows.length, 5); i++) {
    const row = rows[i];
    let matches = 0;
    let tempMap = {};
    row.forEach((cell, idx) => {
      if (cell) {
        const val = String(cell).trim();
        tempMap[val] = idx;
        if (['ID', 'Data', 'Título da Missão', 'Status', 'ID Turno', 'Hora Entrada'].includes(val)) {
          matches++;
        }
      }
    });
    if (matches >= 2) {
      headerRowIndex = i;
      colMap = tempMap;
      break;
    }
  }

  // Fallback se não encontrar por correspondência exata
  if (headerRowIndex === -1 && rows.length >= 2) {
    headerRowIndex = 1;
    rows[1].forEach((h, idx) => {
      if (h) colMap[h.trim()] = idx;
    });
  }

  const dataRows = headerRowIndex !== -1 ? rows.slice(headerRowIndex + 1) : [];
  return { headerRowIndex, colMap, dataRows };
}

async function getSheetData(sheets, spreadsheetId, rangeName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: rangeName,
  });
  const rows = res.data.values;
  if (!rows || rows.length === 0) return [];

  const { colMap, dataRows } = parseSheetRows(rows);

  return dataRows.map((row, rIdx) => {
    let obj = { _linha: rIdx + (rows.length - dataRows.length + 1) }; 
    Object.keys(colMap).forEach(key => {
      obj[key] = row[colMap[key]] !== undefined ? row[colMap[key]] : '';
    });
    obj.id = obj["ID"] || obj["ID Turno"] || obj.id || "";
    obj.data = obj["Data"] || "";
    obj.titulo = obj["Título da Missão"] || "";
    obj.comodo = obj["Cômodo"] || "";
    obj.tempoEstimado = obj["Tempo Est. (min)"] || "";
    obj.prioridade = obj["Prioridade"] || "";
    obj.status = obj["Status"] || obj["Status do Turno"] || "";
    return obj;
  });
}

async function formatarTabelaAPI(sheets, spreadsheetId, sheetName) {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetObj = meta.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheetObj) return;
    const sheetId = sheetObj.properties.sheetId;

    const resVals = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A1:Z500` });
    const rows = resVals.data.values || [];
    if (rows.length === 0) return;

    const { colMap } = parseSheetRows(rows);
    const validColIndexes = Object.values(colMap);
    if (validColIndexes.length === 0) return;

    const startRowIndex = 1; 
    const endRowIndex = rows.length; 
    const startColumnIndex = Math.min(...validColIndexes);
    const endColumnIndex = Math.max(...validColIndexes) + 1;

    let requests = [
      {
        repeatCell: {
          range: { sheetId, startRowIndex: 1, endRowIndex, startColumnIndex, endColumnIndex },
          cell: { userEnteredFormat: { textFormat: { fontFamily: "Roboto" } } },
          fields: "userEnteredFormat.textFormat.fontFamily"
        }
      },
      {
        updateBorders: {
          range: { sheetId, startRowIndex, endRowIndex, startColumnIndex, endColumnIndex },
          top: { style: 'MEDIUM', color: { red: 0, green: 0, blue: 0 } },
          bottom: { style: 'MEDIUM', color: { red: 0, green: 0, blue: 0 } },
          left: { style: 'MEDIUM', color: { red: 0, green: 0, blue: 0 } },
          right: { style: 'MEDIUM', color: { red: 0, green: 0, blue: 0 } },
          innerHorizontal: { style: 'THIN', color: { red: 0.8, green: 0.8, blue: 0.8 } },
          innerVertical: { style: 'THIN', color: { red: 0.8, green: 0.8, blue: 0.8 } }
        }
      }
    ];

    await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
  } catch (e) {
    console.error("Erro ao formatar tabela:", e);
  }
}

async function normalizarEGerarProgressoHoje(sheets, spreadsheetId) {
  const hojeStr = getDataHojeStr();
  
  const missoesRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Missões!A1:Z100" });
  const mParsed = parseSheetRows(missoesRes.data.values || []);
  if (mParsed.dataRows.length === 0) return;
  const mColMap = mParsed.colMap;

  const progRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Progresso Diário!A1:Z1000" });
  const pRows = progRes.data.values || [];
  const pParsed = parseSheetRows(pRows);
  const pColMap = pParsed.colMap;
  const pData = pParsed.dataRows;

  const jaTemHoje = pData.some(row => {
    const dataVal = row[pColMap["Data"]] || "";
    return String(dataVal).trim() === hojeStr;
  });

  if (!jaTemHoje && mParsed.dataRows.length > 0) {
    let maxId = 999;
    pData.forEach(row => {
      const idVal = parseInt(row[pColMap["ID"]], 10);
      if (!isNaN(idVal) && idVal > maxId) maxId = idVal;
    });

    let nextRow = pRows.length + 1;
    let newRows = [];
    let currentId = maxId + 1;

    mParsed.dataRows.forEach(mRow => {
      let titulo = mRow[mColMap["Título da Missão"]] || "";
      let comodo = mRow[mColMap["Cômodo"]] || "";
      let tempoEst = mRow[mColMap["Tempo Est. (min)"]] || "";
      let prioridade = mRow[mColMap["Prioridade"]] || "Média";

      if (titulo) {
        let maxColIndex = Math.max(...Object.values(pColMap));
        let rowArray = new Array(maxColIndex + 1).fill("");
        
        if (pColMap["ID"] !== undefined) rowArray[pColMap["ID"]] = currentId;
        if (pColMap["Data"] !== undefined) rowArray[pColMap["Data"]] = hojeStr;
        if (pColMap["Título da Missão"] !== undefined) rowArray[pColMap["Título da Missão"]] = titulo;
        if (pColMap["Cômodo"] !== undefined) rowArray[pColMap["Cômodo"]] = comodo;
        if (pColMap["Tempo Est. (min)"] !== undefined) rowArray[pColMap["Tempo Est. (min)"]] = tempoEst;
        if (pColMap["Prioridade"] !== undefined) rowArray[pColMap["Prioridade"]] = prioridade;
        if (pColMap["Status"] !== undefined) rowArray[pColMap["Status"]] = "Pendente";
        if (pColMap["Hora de Início"] !== undefined) rowArray[pColMap["Hora de Início"]] = "";
        if (pColMap["Hora de Término"] !== undefined) rowArray[pColMap["Hora de Término"]] = "";

        newRows.push(rowArray);
        currentId++;
      }
    });

    if (newRows.length > 0) {
      await sheets.spreadsheets.values.append({
        spreadsheetId,
        range: `Progresso Diário!A${nextRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: newRows }
      });
      await formatarTabelaAPI(sheets, spreadsheetId, "Progresso Diário");
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.SPREADSHEET_ID;

    if (!spreadsheetId) {
      return res.status(500).json({ status: 'error', message: 'SPREADSHEET_ID is missing in environment variables' });
    }

    if (req.method === 'GET') {
      await normalizarEGerarProgressoHoje(sheets, spreadsheetId);

      const missoes = await getSheetData(sheets, spreadsheetId, "Missões!A1:Z500");
      const progresso = await getSheetData(sheets, spreadsheetId, "Progresso Diário!A1:Z1000");
      const turnos = await getSheetData(sheets, spreadsheetId, "Registro de Ponto!A1:Z500");

      const hojeStr = getDataHojeStr();
      let pontoAtivo = false;
      let horaEntradaMs = null;

      for (let i = turnos.length - 1; i >= 0; i--) {
        const t = turnos[i];
        if (t.data === hojeStr) {
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

      return res.status(200).json({
        status: "success",
        missoes: progresso.length > 0 ? progresso : missoes,
        turnos: turnos,
        pontoAtivo: pontoAtivo,
        horaEntradaMs: horaEntradaMs,
        estatisticas: { concluidas: concluidasCount }
      });
    }

    if (req.method === 'POST') {
      const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const acao = data.acao;
      const hojeStr = getDataHojeStr();

      if (acao === 'baterPonto') {
        const resPonto = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Registro de Ponto!A1:Z500" });
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
          const dadosPonto = await getSheetData(sheets, spreadsheetId, "Registro de Ponto!A1:Z500");
          let linhaTurno = -1;
          for (let i = dadosPonto.length - 1; i >= 0; i--) {
            const t = dadosPonto[i];
            const st = (t["Status do Turno"] || "").toUpperCase();
            const hs = t["Hora Saída"] || "";
            if ((t.data === hojeStr || !t.data) && (st === "EM SERVIÇO" || !hs)) {
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
            const horaEntradaStr = turnoAlvo["Hora Entrada"] || "00:00:00";
            
            const [he, me, se] = horaEntradaStr.split(':').map(Number);
            const [hs2, ms2, ss2] = horaSaidaStr.split(':').map(Number);
            
            const totalSegsTrabalho = (hs2 * 3600 + ms2 * 60 + (ss2 || 0)) - (he * 3600 + me * 60 + (se || 0));
            const segsTrabalhoVal = Math.max(0, totalSegsTrabalho);
            
            const horasTrab = String(Math.floor(segsTrabalhoVal / 3600)).padStart(2, '0');
            const minsTrab = String(Math.floor((segsTrabalhoVal % 3600) / 60)).padStart(2, '0');
            const segsTrab = String(segsTrabalhoVal % 60).padStart(2, '0');
            const tempoTrabalhadoFormatado = `${horasTrab}:${minsTrab}:${segsTrab}`;

            const progressoDados = await getSheetData(sheets, spreadsheetId, "Progresso Diário!A1:Z1000");
            let totalMinutosMissoes = 0;
            progressoDados.forEach(m => {
              if (m.data === hojeStr && (m.status === "Concluído" || m.Status === "Concluído")) {
                const est = parseFloat(m.tempoEstimado || m["Tempo Est. (min)"] || 0);
                if (!isNaN(est)) totalMinutosMissoes += est;
              }
            });

            const totalSegsMissoes = totalMinutosMissoes * 60;
            const creditosPontoSegs = Math.max(0, segsTrabalhoVal - totalSegsMissoes);
            const minCred = Math.floor(creditosPontoSegs / 60);
            const segCred = creditosPontoSegs % 60;
            let creditosPontoFormatado = `${segCred}s`;
            if (minCred > 0) {
              const hC = Math.floor(minCred / 60);
              const mC = minCred % 60;
              creditosPontoFormatado = hC > 0 ? `${hC}h e ${mC}min` : `${mC}min e ${segCred}s`;
            }

            let updates = [];
            if (colMap["Hora Saída"] !== undefined) updates.push({ range: `Registro de Ponto!${columnToLetter(colMap["Hora Saída"] + 1)}${linhaTurno}`, values: [[horaSaidaStr]] });
            if (colMap["Status do Turno"] !== undefined) updates.push({ range: `Registro de Ponto!${columnToLetter(colMap["Status do Turno"] + 1)}${linhaTurno}`, values: [["Encerrado"]] });
            if (colMap["Tempo Trabalhado"] !== undefined) updates.push({ range: `Registro de Ponto!${columnToLetter(colMap["Tempo Trabalhado"] + 1)}${linhaTurno}`, values: [[tempoTrabalhadoFormatado]] });
            if (colMap["Créditos"] !== undefined) updates.push({ range: `Registro de Ponto!${columnToLetter(colMap["Créditos"] + 1)}${linhaTurno}`, values: [[creditosPontoFormatado]] });

            if (updates.length > 0) {
              await sheets.spreadsheets.batchUpdate({
                spreadsheetId,
                requestBody: { valueInputOption: 'USER_ENTERED', data: updates }
              });
            }
          }
        }

        await formatarTabelaAPI(sheets, spreadsheetId, "Registro de Ponto");
        return res.status(200).json({ status: "success" });
      }

      if (acao === 'adicionarMissao') {
        const progRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Progresso Diário!A1:Z500" });
        const pParsed = parseSheetRows(progRes.data.values || []);
        const colMap = pParsed.colMap;

        let maxId = 999;
        pParsed.dataRows.forEach(r => {
          const idVal = parseInt(r[colMap["ID"]], 10);
          if (!isNaN(idVal) && idVal > maxId) maxId = idVal;
        });
        const novoId = maxId + 1;
        const nextRow = (progRes.data.values || []).length + 1;

        let maxColIndex = Math.max(...Object.values(colMap), 0);
        let rowArray = new Array(maxColIndex + 1).fill("");
        
        if (colMap["ID"] !== undefined) rowArray[colMap["ID"]] = novoId;
        if (colMap["Data"] !== undefined) rowArray[colMap["Data"]] = data.data || hojeStr;
        if (colMap["Título da Missão"] !== undefined) rowArray[colMap["Título da Missão"]] = data.titulo;
        if (colMap["Cômodo"] !== undefined) rowArray[colMap["Cômodo"]] = data.comodo;
        if (colMap["Tempo Est. (min)"] !== undefined) rowArray[colMap["Tempo Est. (min)"]] = data.tempoEstimado;
        if (colMap["Prioridade"] !== undefined) rowArray[colMap["Prioridade"]] = data.prioridade;
        if (colMap["Status"] !== undefined) rowArray[colMap["Status"]] = "Pendente";
        if (colMap["Hora de Início"] !== undefined) rowArray[colMap["Hora de Início"]] = "";
        if (colMap["Hora de Término"] !== undefined) rowArray[colMap["Hora de Término"]] = "";

        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `Progresso Diário!A${nextRow}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [rowArray] }
        });

        await formatarTabelaAPI(sheets, spreadsheetId, "Progresso Diário");
        return res.status(200).json({ status: "success", id: novoId });
      }

      if (acao === 'atualizarEstadoMissao' || acao === 'concluirMissao') {
        const dados = await getSheetData(sheets, spreadsheetId, "Progresso Diário!A1:Z1000");
        const progRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Progresso Diário!A1:Z500" });
        const pParsed = parseSheetRows(progRes.data.values || []);
        const colMap = pParsed.colMap;

        let missaoAlvo = dados.find(m => String(m.id) === String(data.id) && m.data === hojeStr) ||
                           dados.find(m => String(m.id) === String(data.id));

        if (!missaoAlvo && data.titulo) {
          missaoAlvo = dados.slice().reverse().find(m => m.titulo.toLowerCase() === String(data.titulo).toLowerCase());
        }

        if (missaoAlvo) {
          const linha = missaoAlvo._linha;
          let updates = [];

          if (data.estadoMissao === 'EmAndamento') {
            if (colMap["Status"] !== undefined) updates.push({ range: `Progresso Diário!${columnToLetter(colMap["Status"] + 1)}${linha}`, values: [["Em Andamento"]] });
            if (data.horaExata && colMap["Hora de Início"] !== undefined) {
              updates.push({ range: `Progresso Diário!${columnToLetter(colMap["Hora de Início"] + 1)}${linha}`, values: [[data.horaExata]] });
            }
          } else if (acao === 'concluirMissao') {
            if (colMap["Status"] !== undefined) updates.push({ range: `Progresso Diário!${columnToLetter(colMap["Status"] + 1)}${linha}`, values: [["Concluído"]] });
            if (data.horaExata && colMap["Hora de Término"] !== undefined) {
              updates.push({ range: `Progresso Diário!${columnToLetter(colMap["Hora de Término"] + 1)}${linha}`, values: [[data.horaExata]] });
            }

            const tempoEst = parseFloat(missaoAlvo.tempoEstimado || 0);
            let tempoReal = data.tempoRealMin !== undefined ? parseFloat(data.tempoRealMin) : NaN;
            if (isNaN(tempoReal)) tempoReal = tempoEst;

            const creditosMin = Math.max(0, tempoEst - tempoReal);
            let creditosFormatados = "0s";
            if (creditosMin > 0) {
              const totalSegs = Math.round(creditosMin * 60);
              const m = Math.floor(totalSegs / 60);
              const s = totalSegs % 60;
              creditosFormatados = m > 0 ? `${m}min e ${s}s` : `${s}s`;
            }

            if (colMap["Créditos"] !== undefined) {
              updates.push({ range: `Progresso Diário!${columnToLetter(colMap["Créditos"] + 1)}${linha}`, values: [[creditosFormatados]] });
            }
          } else if (data.estadoMissao === 'Cancelado') {
            if (colMap["Status"] !== undefined) updates.push({ range: `Progresso Diário!${columnToLetter(colMap["Status"] + 1)}${linha}`, values: [["Cancelado"]] });
          }

          if (updates.length > 0) {
            await sheets.spreadsheets.batchUpdate({
              spreadsheetId,
              requestBody: { valueInputOption: 'USER_ENTERED', data: updates }
            });
          }
        }

        await formatarTabelaAPI(sheets, spreadsheetId, "Progresso Diário");
        return res.status(200).json({ status: "success" });
      }

      if (acao === 'editarMissao') {
        const dados = await getSheetData(sheets, spreadsheetId, "Progresso Diário!A1:Z1000");
        const progRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Progresso Diário!A1:Z500" });
        const pParsed = parseSheetRows(progRes.data.values || []);
        const colMap = pParsed.colMap;

        const missaoAlvo = dados.find(m => String(m.id) === String(data.id));
        if (missaoAlvo) {
          const linha = missaoAlvo._linha;
          let batchUpdates = [];
          
          if (colMap["Título da Missão"] !== undefined) batchUpdates.push({ range: `Progresso Diário!${columnToLetter(colMap["Título da Missão"] + 1)}${linha}`, values: [[data.titulo]] });
          if (colMap["Cômodo"] !== undefined) batchUpdates.push({ range: `Progresso Diário!${columnToLetter(colMap["Cômodo"] + 1)}${linha}`, values: [[data.comodo]] });
          if (colMap["Tempo Est. (min)"] !== undefined) batchUpdates.push({ range: `Progresso Diário!${columnToLetter(colMap["Tempo Est. (min)"] + 1)}${linha}`, values: [[data.tempoEstimado]] });
          if (colMap["Prioridade"] !== undefined) batchUpdates.push({ range: `Progresso Diário!${columnToLetter(colMap["Prioridade"] + 1)}${linha}`, values: [[data.prioridade]] });

          if (batchUpdates.length > 0) {
            await sheets.spreadsheets.batchUpdate({
              spreadsheetId,
              requestBody: { valueInputOption: 'USER_ENTERED', data: batchUpdates }
            });
          }
        }

        await formatarTabelaAPI(sheets, spreadsheetId, "Progresso Diário");
        return res.status(200).json({ status: "success" });
      }

      if (acao === 'excluirMissao') {
        const dados = await getSheetData(sheets, spreadsheetId, "Progresso Diário!A1:Z1000");
        const missaoAlvo = dados.find(m => String(m.id) === String(data.id));
        if (missaoAlvo) {
          const sheetInfo = await sheets.spreadsheets.get({ spreadsheetId });
          const sheetProgressoObj = sheetInfo.data.sheets.find(s => s.properties.title === "Progresso Diário");
          const sheetId = sheetProgressoObj.properties.sheetId;

          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [{
                deleteDimension: {
                  range: {
                    sheetId: sheetId,
                    dimension: 'ROWS',
                    startIndex: missaoAlvo._linha - 1,
                    endIndex: missaoAlvo._linha
                  }
                }
              }]
            }
          });
        }

        await formatarTabelaAPI(sheets, spreadsheetId, "Progresso Diário");
        return res.status(200).json({ status: "success" });
      }

      return res.status(400).json({ status: "error", message: "Ação desconhecida" });
    }

    res.status(405).json({ status: "error", message: "Method not allowed" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ status: "error", message: error.toString() });
  }
}