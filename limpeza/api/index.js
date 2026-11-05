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

async function getSheetData(sheets, spreadsheetId, rangeName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: rangeName,
  });
  const rows = res.data.values;
  if (!rows || rows.length < 2) return [];

  const header = rows[1]; 
  const dataRows = rows.slice(2); 

  let colMap = {};
  header.forEach((h, idx) => {
    if (h) colMap[h.trim()] = idx;
  });

  return dataRows.map((row, rIdx) => {
    let obj = { _linha: rIdx + 3 }; 
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

async function normalizarEGerarProgressoHoje(sheets, spreadsheetId) {
  const hojeStr = getDataHojeStr();
  
  const missoesRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Missões!A1:Z100" });
  const mRows = missoesRes.data.values || [];
  if (mRows.length < 3) return;
  const mHeader = mRows[1];
  const mData = mRows.slice(2);
  let mColMap = {};
  mHeader.forEach((h, i) => { if(h) mColMap[h.trim()] = i; });

  const progRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Progresso Diário!A1:Z500" });
  const pRows = progRes.data.values || [];
  const pHeader = pRows[1] || [];
  const pData = pRows.slice(2);
  let pColMap = {};
  pHeader.forEach((h, i) => { if(h) pColMap[h.trim()] = i; });

  const jaTemHoje = pData.some(row => {
    const dataVal = row[pColMap["Data"]] || "";
    return String(dataVal).trim() === hojeStr;
  });

  if (!jaTemHoje && mData.length > 0) {
    let maxId = 999;
    pData.forEach(row => {
      const idVal = parseInt(row[pColMap["ID"]], 10);
      if (!isNaN(idVal) && idVal > maxId) maxId = idVal;
    });

    let nextRow = pRows.length + 1;
    let newRows = [];
    let currentId = maxId + 1;

    mData.forEach(mRow => {
      let titulo = mRow[mColMap["Título da Missão"]] || "";
      let comodo = mRow[mColMap["Cômodo"]] || "";
      let tempoEst = mRow[mColMap["Tempo Est. (min)"]] || "";
      let prioridade = mRow[mColMap["Prioridade"]] || "Média";

      if (titulo) {
        let rowArray = new Array(Math.max(...Object.values(pColMap)) + 1).fill("");
        rowArray[pColMap["ID"]] = currentId;
        rowArray[pColMap["Data"]] = hojeStr;
        rowArray[pColMap["Título da Missão"]] = titulo;
        rowArray[pColMap["Cômodo"]] = comodo;
        rowArray[pColMap["Tempo Est. (min)"]] = tempoEst;
        rowArray[pColMap["Prioridade"]] = prioridade;
        rowArray[pColMap["Status"]] = "Pendente";
        rowArray[pColMap["Hora de Início"]] = "";
        rowArray[pColMap["Hora de Término"]] = "";
        rowArray[pColMap["Créditos"]] = "0s";
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
        const rows = resPonto.data.values || [];
        const header = rows[1] || [];
        let colMap = {};
        header.forEach((h, i) => { if(h) colMap[h.trim()] = i; });

        if (data.status === 'ENTRADA') {
          let maxId = 999;
          rows.slice(2).forEach(r => {
            const idVal = parseInt(r[colMap["ID Turno"]], 10);
            if (!isNaN(idVal) && idVal > maxId) maxId = idVal;
          });
          const novoIdTurno = maxId + 1;
          const nextRow = Math.max(rows.length + 1, 3);

          let rowArray = new Array(Math.max(...Object.values(colMap)) + 1).fill("");
          rowArray[colMap["ID Turno"]] = novoIdTurno;
          rowArray[colMap["Data"]] = hojeStr;
          rowArray[colMap["Hora Entrada"]] = data.horaExata || getHoraAtualStr();
          rowArray[colMap["Hora Saída"]] = "";
          rowArray[colMap["Duração (Minutos)"]] = "";
          rowArray[colMap["Tempo Trabalhado"]] = "";
          rowArray[colMap["Créditos"]] = "0s";
          rowArray[colMap["Status do Turno"]] = "Em Serviço";

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
            if (t.data === hojeStr && (st === "EM SERVIÇO" || !hs)) {
              linhaTurno = t._linha;
              break;
            }
          }

          if (linhaTurno !== -1) {
            const horaSaidaStr = data.horaExata || getHoraAtualStr();
            let updates = [
              { range: `Registro de Ponto!${columnToLetter(colMap["Hora Saída"] + 1)}${linhaTurno}`, values: [[horaSaidaStr]] },
              { range: `Registro de Ponto!${columnToLetter(colMap["Status do Turno"] + 1)}${linhaTurno}`, values: [["Encerrado"]] }
            ];

            if (data.duracaoSegundos) {
              const minTotais = Math.round(data.duracaoSegundos / 60);
              const h = String(Math.floor(minTotais / 60)).padStart(2, '0');
              const m = String(minTotais % 60).padStart(2, '0');
              updates.push({ range: `Registro de Ponto!${columnToLetter(colMap["Duração (Minutos)"] + 1)}${linhaTurno}`, values: [[minTotais]] });
              updates.push({ range: `Registro de Ponto!${columnToLetter(colMap["Tempo Trabalhado"] + 1)}${linhaTurno}`, values: [[`${h}:${m}:00`]] });
            }

            await sheets.spreadsheets.batchUpdate({
              spreadsheetId,
              requestBody: { valueInputOption: 'USER_ENTERED', data: updates }
            });
          }
        }
        return res.status(200).json({ status: "success" });
      }

      if (acao === 'adicionarMissao') {
        const progRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Progresso Diário!A1:Z500" });
        const rows = progRes.data.values || [];
        const header = rows[1] || [];
        let colMap = {};
        header.forEach((h, i) => { if(h) colMap[h.trim()] = i; });

        let maxId = 999;
        rows.slice(2).forEach(r => {
          const idVal = parseInt(r[colMap["ID"]], 10);
          if (!isNaN(idVal) && idVal > maxId) maxId = idVal;
        });
        const novoId = maxId + 1;
        const nextRow = Math.max(rows.length + 1, 3);

        let rowArray = new Array(Math.max(...Object.values(colMap)) + 1).fill("");
        rowArray[colMap["ID"]] = novoId;
        rowArray[colMap["Data"]] = data.data || hojeStr;
        rowArray[colMap["Título da Missão"]] = data.titulo;
        rowArray[colMap["Cômodo"]] = data.comodo;
        rowArray[colMap["Tempo Est. (min)"]] = data.tempoEstimado;
        rowArray[colMap["Prioridade"]] = data.prioridade;
        rowArray[colMap["Status"]] = "Pendente";
        rowArray[colMap["Hora de Início"]] = "";
        rowArray[colMap["Hora de Término"]] = "";
        rowArray[colMap["Créditos"]] = "0s";

        await sheets.spreadsheets.values.append({
          spreadsheetId,
          range: `Progresso Diário!A${nextRow}`,
          valueInputOption: 'USER_ENTERED',
          requestBody: { values: [rowArray] }
        });

        return res.status(200).json({ status: "success", id: novoId });
      }

      if (acao === 'atualizarEstadoMissao' || acao === 'concluirMissao') {
        const dados = await getSheetData(sheets, spreadsheetId, "Progresso Diário!A1:Z1000");
        const progRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Progresso Diário!A1:Z2" });
        const header = progRes.data.values[1] || [];
        let colMap = {};
        header.forEach((h, i) => { if(h) colMap[h.trim()] = i; });

        const missaoAlvo = dados.find(m => String(m.id) === String(data.id) && m.data === hojeStr) ||
                           dados.find(m => String(m.id) === String(data.id));

        if (missaoAlvo) {
          const linha = missaoAlvo._linha;
          let updates = [];

          if (data.estadoMissao === 'EmAndamento') {
            updates.push({ range: `Progresso Diário!${columnToLetter(colMap["Status"] + 1)}${linha}`, values: [["Em Andamento"]] });
            if (data.horaExata) {
              updates.push({ range: `Progresso Diário!${columnToLetter(colMap["Hora de Início"] + 1)}${linha}`, values: [[data.horaExata]] });
            }
          } else if (acao === 'concluirMissao') {
            updates.push({ range: `Progresso Diário!${columnToLetter(colMap["Status"] + 1)}${linha}`, values: [["Concluído"]] });
            if (data.horaExata) {
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

            updates.push({ range: `Progresso Diário!${columnToLetter(colMap["Créditos"] + 1)}${linha}`, values: [[creditosFormatados]] });
          } else if (data.estadoMissao === 'Cancelado') {
            updates.push({ range: `Progresso Diário!${columnToLetter(colMap["Status"] + 1)}${linha}`, values: [["Cancelado"]] });
          }

          if (updates.length > 0) {
            await sheets.spreadsheets.batchUpdate({
              spreadsheetId,
              requestBody: { valueInputOption: 'USER_ENTERED', data: updates }
            });
          }
        }
        return res.status(200).json({ status: "success" });
      }

      if (acao === 'editarMissao') {
        const dados = await getSheetData(sheets, spreadsheetId, "Progresso Diário!A1:Z1000");
        const progRes = await sheets.spreadsheets.values.get({ spreadsheetId, range: "Progresso Diário!A1:Z2" });
        const header = progRes.data.values[1] || [];
        let colMap = {};
        header.forEach((h, i) => { if(h) colMap[h.trim()] = i; });

        const missaoAlvo = dados.find(m => String(m.id) === String(data.id));
        if (missaoAlvo) {
          const linha = missaoAlvo._linha;
          await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              valueInputOption: 'USER_ENTERED',
              data: [
                { range: `Progresso Diário!${columnToLetter(colMap["Título da Missão"] + 1)}${linha}`, values: [[data.titulo]] },
                { range: `Progresso Diário!${columnToLetter(colMap["Cômodo"] + 1)}${linha}`, values: [[data.comodo]] },
                { range: `Progresso Diário!${columnToLetter(colMap["Tempo Est. (min)"] + 1)}${linha}`, values: [[data.tempoEstimado]] },
                { range: `Progresso Diário!${columnToLetter(colMap["Prioridade"] + 1)}${linha}`, values: [[data.prioridade]] }
              ]
            }
          });
        }
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

function columnToLetter(column) {
  let temp, letter = '';
  while (column > 0) {
    temp = (column - 1) % 26;
    letter = String.fromCharCode(temp + 65) + letter;
    column = (column - temp - 1) / 26;
  }
  return letter;
}