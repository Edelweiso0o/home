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

function parseSheetRows(rows) {
  if (!rows || rows.length === 0) return { headerRowIndex: -1, colMap: {}, dataRows: [] };

  let headerRowIndex = -1;
  let colMap = {};

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
    obj.data = obj["Data"] || "";
    obj.titulo = obj["Título da Missão"] || "";
    obj.comodo = obj["Cômodo"] || "";
    obj.tempoEstimado = obj["Tempo Est. (min)"] || "";
    obj.prioridade = obj["Prioridade"] || "";
    obj.status = obj["Status"] || obj["Status do Turno"] || "";
    return obj;
  });
}

// FORMATAÇÃO LIMPA E SEGURA SEM ERROS DE ENUM
async function formatarTabelaAPI(sheets, spreadsheetId, sheetName) {
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId });
    const sheetObj = meta.data.sheets.find(s => s.properties.title === sheetName);
    if (!sheetObj) return;
    const sheetId = sheetObj.properties.sheetId;

    const resVals = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${sheetName}!A1:Z500` });
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
      // 1. Centraliza os dados da tabela
      {
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: startRowIndex + 1,
            endRowIndex,
            startColumnIndex,
            endColumnIndex
          },
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

    // 2. Alinha especificamente a coluna "Título da Missão" à Esquerda
    const tituloColIdx = colMap["Título da Missão"];
    if (tituloColIdx !== undefined) {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: startRowIndex + 1,
            endRowIndex,
            startColumnIndex: tituloColIdx,
            endColumnIndex: tituloColIdx + 1
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: "LEFT"
            }
          },
          fields: "userEnteredFormat.horizontalAlignment"
        }
      });
    }

    // 3. Formata o Cabeçalho
    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex,
          endRowIndex: startRowIndex + 1,
          startColumnIndex,
          endColumnIndex
        },
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

    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests }
    });
  } catch (e) {
    console.error("Erro ao formatar tabela por intervalo:", e);
  }
}

async function sincronizarMissossDoDiaEmSegundoPlano(sheets, spreadsheetId) {
  try {
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

    const missoesHojeNaPlanilha = pData.filter(row => {
      const dataVal = row[pColMap["Data"]] || "";
      return String(dataVal).trim() === hojeStr;
    });

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
        const jaExiste = missoesHojeNaPlanilha.some(pRow => {
          const tVal = pRow[pColMap["Título da Missão"]] || "";
          return String(tVal).trim().toLowerCase() === String(titulo).trim().toLowerCase();
        });

        if (!jaExiste) {
          let maxColIndex = Math.max(...Object.values(pColMap), 0);
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
  } catch (e) {
    console.error("Erro em segundo plano ao sincronizar missões do dia:", e);
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
      return res.status(500).json({ status: 'error', message: 'SPREADSHEET_ID is missing' });
    }

    if (req.method === 'GET') {
      await sincronizarMissossDoDiaEmSegundoPlano(sheets, spreadsheetId);
      await formatarTabelaAPI(sheets, spreadsheetId, "Progresso Diário");

      const progresso = await getSheetData(sheets, spreadsheetId, "Progresso Diário!A1:Z1000");
      const turnos = await getSheetData(sheets, spreadsheetId, "Registro de Ponto!A1:Z500");
      const missoes = await getSheetData(sheets, spreadsheetId, "Missões!A1:Z500");

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

            let dataUpdates = [];
            if (colMap["Hora Saída"] !== undefined) dataUpdates.push({ range: `Registro de Ponto!${columnToLetter(colMap["Hora Saída"] + 1)}${linhaTurno}`, values: [[horaSaidaStr]] });
            if (colMap["Status do Turno"] !== undefined) dataUpdates.push({ range: `Registro de Ponto!${columnToLetter(colMap["Status do Turno"] + 1)}${linhaTurno}`, values: [["Encerrado"]] });
            if (colMap["Tempo Trabalhado"] !== undefined) dataUpdates.push({ range: `Registro de Ponto!${columnToLetter(colMap["Tempo Trabalhado"] + 1)}${linhaTurno}`, values: [[tempoTrabalhadoFormatado]] });

            if (dataUpdates.length > 0) {
              await sheets.spreadsheets.values.batchUpdate({
                spreadsheetId,
                requestBody: {
                  valueInputOption: 'USER_ENTERED',
                  data: dataUpdates
                }
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

        let missaoAlvo = null;
        if (data.titulo) {
          missaoAlvo = dados.slice().reverse().find(m => String(m.titulo).trim().toLowerCase() === String(data.titulo).trim().toLowerCase() && (m.data === hojeStr || !m.data));
        }
        if (!missaoAlvo) {
          missaoAlvo = dados.find(m => String(m.id) === String(data.id));
        }

        if (missaoAlvo) {
          const linha = missaoAlvo._linha;
          let dataUpdates = [];

          if (data.estadoMissao === 'EmAndamento') {
            if (colMap["Status"] !== undefined) dataUpdates.push({ range: `Progresso Diário!${columnToLetter(colMap["Status"] + 1)}${linha}`, values: [["Em Andamento"]] });
            if (data.horaExata && colMap["Hora de Início"] !== undefined) {
              dataUpdates.push({ range: `Progresso Diário!${columnToLetter(colMap["Hora de Início"] + 1)}${linha}`, values: [[data.horaExata]] });
            }
          } else if (acao === 'concluirMissao') {
            if (colMap["Status"] !== undefined) dataUpdates.push({ range: `Progresso Diário!${columnToLetter(colMap["Status"] + 1)}${linha}`, values: [["Concluído"]] });
            if (data.horaExata && colMap["Hora de Término"] !== undefined) {
              dataUpdates.push({ range: `Progresso Diário!${columnToLetter(colMap["Hora de Término"] + 1)}${linha}`, values: [[data.horaExata]] });
            }
          } else if (data.estadoMissao === 'Cancelado') {
            if (colMap["Status"] !== undefined) dataUpdates.push({ range: `Progresso Diário!${columnToLetter(colMap["Status"] + 1)}${linha}`, values: [["Cancelado"]] });
          }

          if (dataUpdates.length > 0) {
            await sheets.spreadsheets.values.batchUpdate({
              spreadsheetId,
              requestBody: {
                valueInputOption: 'USER_ENTERED',
                data: dataUpdates
              }
            });
          }
        }

        await formatarTabelaAPI(sheets, spreadsheetId, "Progresso Diário");
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