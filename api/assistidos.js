import { google } from 'googleapis';

/* ============================================================
   API do módulo Assistidos
   ------------------------------------------------------------
   Duas abas na planilha (mesmo modelo do VBA, mas normalizado):

     obras      -> uma linha por série/anime/desenho/novela/filme
     episodios  -> uma linha por episódio/capítulo assistido

   O progresso NUNCA é gravado: é calculado aqui (episódios
   distintos assistidos / total_episodios informado pelo dono).

   Mesmo esquema de acesso do módulo limpeza:
     - env GOOGLE_CREDENTIALS  (JSON da service account)
     - env SPREADSHEET_ID      (id da planilha)
     - env API_KEY             (header X-Api-Key; se ausente, ignora)
   ============================================================ */

const ABA_OBRAS = 'obras';
const ABA_EPS = 'episodios';

// Cabeçalhos exatos, na ordem em que foram criados na planilha.
const COLS_OBRAS = ['id', 'tipo', 'titulo', 'titulo_original', 'ano', 'plataforma',
  'total_episodios', 'status', 'nota', 'comentario', 'criado_em', 'atualizado_em'];
const COLS_EPS = ['id', 'obra_id', 'obra_titulo', 'data_assistido', 'data_original',
  'temporada', 'episodio', 'nome_episodio', 'duracao_min', 'plataforma'];

const TIPOS = ['serie', 'anime', 'desenho', 'novela', 'documentario', 'filme'];
const STATUS = ['assistindo', 'completo', 'pausado', 'abandonado', 'quero_ver'];

// Célula D4 desta planilha guarda a quantidade de linhas já usadas em cada aba.
// Aqui não dependemos disso: lemos a aba inteira e descartamos as vazias.
const RANGE_OBRAS = `${ABA_OBRAS}!A1:L`;
const RANGE_EPS = `${ABA_EPS}!A1:J`;

function getAuth() {
  const credentialsJson = process.env.GOOGLE_CREDENTIALS;
  if (!credentialsJson) throw new Error('GOOGLE_CREDENTIALS missing');
  return new google.auth.GoogleAuth({
    credentials: JSON.parse(credentialsJson),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

function hojeISO() {
  const d = new Date();
  const o = { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' };
  return new Intl.DateTimeFormat('sv-SE', o).format(d); // sv-SE => YYYY-MM-DD
}

function num(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function txt(v) {
  return v === null || v === undefined ? '' : String(v).trim();
}

// ---------------- leitura ----------------

async function lerAba(sheets, spreadsheetId, range, colunas) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId, range });
  const rows = res.data.values || [];
  if (rows.length <= 1) return [];

  // A linha 1 é o cabeçalho. Mapeia por nome para não depender da ordem.
  const cabecalho = rows[0].map(txt);
  const idx = {};
  colunas.forEach((c) => { idx[c] = cabecalho.indexOf(c); });

  return rows.slice(1)
    .map((row, i) => {
      const obj = { _linha: i + 2 }; // linha real na planilha (1-based, +1 do cabeçalho)
      colunas.forEach((c) => { obj[c] = idx[c] >= 0 ? row[idx[c]] : ''; });
      return obj;
    })
    .filter((o) => txt(o.id) !== '');
}

// ---------------- cálculo ----------------

// Progresso = episódios distintos assistidos / total_episodios.
// Rewatch conta uma vez só (é o mesmo episódio), mas o tempo soma tudo.
function calcularProgresso(obra, eps) {
  const total = num(obra.total_episodios) || 0;
  const vistos = new Set();
  let minutos = 0;

  for (const e of eps) {
    const t = num(e.temporada);
    const n = num(e.episodio);
    vistos.add(`${t === null ? '-' : t}x${n === null ? '-' : n}`);
    const d = num(e.duracao_min);
    if (d) minutos += d;
  }

  const assistidos = vistos.size;
  const pct = total > 0 ? Math.min(100, Math.round((assistidos / total) * 100)) : null;

  return {
    assistidos,
    total,
    pct,
    minutos,
    horas: Math.round((minutos / 60) * 10) / 10,
    registros: eps.length,
    // temporada mais alta que aparece nos episódios, para o "T12" do card
    ultimaTemporada: eps.reduce((m, e) => Math.max(m, num(e.temporada) || 0), 0) || null,
  };
}

function montarObra(o, eps) {
  const total = num(o.total_episodios);
  const nota = num(o.nota);
  return {
    id: txt(o.id),
    tipo: txt(o.tipo),
    titulo: txt(o.titulo),
    tituloOriginal: txt(o.titulo_original),
    ano: num(o.ano),
    plataforma: txt(o.plataforma),
    // null (e não 0) = dono ainda não informou o total
    epTotal: total === null ? null : total,
    status: txt(o.status) || 'assistindo',
    nota: nota === null ? null : nota,
    comentario: txt(o.comentario),
    criadoEm: txt(o.criado_em),
    atualizadoEm: txt(o.atualizado_em),
    ...calcularProgresso(o, eps),
    episodios: eps
      .slice()
      .sort((a, b) => {
        const ta = num(a.temporada) || 0, tb = num(b.temporada) || 0;
        if (ta !== tb) return ta - tb;
        return (num(a.episodio) || 0) - (num(b.episodio) || 0);
      })
      .map((e) => ({
        id: txt(e.id),
        dataAssistido: txt(e.data_assistido),
        temporada: num(e.temporada),
        episodio: num(e.episodio),
        nome: txt(e.nome_episodio),
        duracaoMin: num(e.duracao_min),
        plataforma: txt(e.plataforma),
      })),
  };
}

async function carregarTudo(sheets, spreadsheetId) {
  const [obras, eps] = await Promise.all([
    lerAba(sheets, spreadsheetId, RANGE_OBRAS, COLS_OBRAS),
    lerAba(sheets, spreadsheetId, RANGE_EPS, COLS_EPS),
  ]);

  const porObra = new Map();
  for (const e of eps) {
    const k = txt(e.obra_id);
    if (!porObra.has(k)) porObra.set(k, []);
    porObra.get(k).push(e);
  }

  return {
    obras: obras.map((o) => montarObra(o, porObra.get(txt(o.id)) || [])),
    eps,
  };
}

// ---------------- escrita ----------------

function letraCol(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// Próximo id sequencial (o001, o002... / e00001...).
function proximoId(prefixo, largura, existentes) {
  let max = 0;
  for (const id of existentes) {
    const m = String(id).match(new RegExp('^' + prefixo + '(\\d+)$'));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return prefixo + String(max + 1).padStart(largura, '0');
}

// Escreve um objeto na linha indicada, respeitando a ordem das colunas.
async function escreverLinha(sheets, spreadsheetId, aba, colunas, linha, dados) {
  const values = [colunas.map((c) => (dados[c] === undefined || dados[c] === null ? '' : dados[c]))];
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${aba}!A${linha}:${letraCol(colunas.length)}${linha}`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

async function adicionarLinha(sheets, spreadsheetId, aba, colunas, dados) {
  const values = [colunas.map((c) => (dados[c] === undefined || dados[c] === null ? '' : dados[c]))];
  const r = await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${aba}!A1`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
  return r.data.updates && r.data.updates.updatedRange;
}

// ---------------- handler ----------------

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');

  const ORIGENS_PERMITIDAS = [
    'https://home-limpeza.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
  ];
  const origemReq = req.headers.origin || '';
  if (ORIGENS_PERMITIDAS.includes(origemReq)) {
    res.setHeader('Access-Control-Allow-Origin', origemReq);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Api-Key');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const chaveEsperada = process.env.API_KEY;
  if (chaveEsperada && req.headers['x-api-key'] !== chaveEsperada) {
    return res.status(401).json({ status: 'error', message: 'Não autorizado. Chave de acesso inválida.' });
  }

  try {
    const sheets = google.sheets({ version: 'v4', auth: getAuth() });
    const spreadsheetId = process.env.SPREADSHEET_ID_ASSISTIDOS || process.env.SPREADSHEET_ID;
    if (!spreadsheetId) {
      return res.status(500).json({ status: 'error', message: 'SPREADSHEET_ID_ASSISTIDOS is missing' });
    }

    // ---------- GET: lista tudo já calculado ----------
    if (req.method === 'GET') {
      const { obras } = await carregarTudo(sheets, spreadsheetId);

      const totalMin = obras.reduce((s, o) => s + o.minutos, 0);
      const porTipo = {};
      for (const o of obras) {
        porTipo[o.tipo] = (porTipo[o.tipo] || 0) + 1;
      }

      return res.status(200).json({
        status: 'success',
        obras,
        resumo: {
          obras: obras.length,
          episodios: obras.reduce((s, o) => s + o.registros, 0),
          minutos: totalMin,
          horas: Math.round((totalMin / 60) * 10) / 10,
          porTipo,
        },
      });
    }

    // ---------- POST: criar / editar / remover ----------
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const acao = txt(body.acao);

      const { obras } = await carregarTudo(sheets, spreadsheetId);
      const agora = hojeISO();

      // --- criar ou editar uma obra ---
      if (acao === 'salvarObra') {
        const d = body.obra || {};
        const titulo = txt(d.titulo);
        if (!titulo) return res.status(400).json({ status: 'error', message: 'Informe o título.' });

        const tipo = TIPOS.includes(d.tipo) ? d.tipo : 'serie';
        const status = STATUS.includes(d.status) ? d.status : 'assistindo';

        if (d.id) {
          const atual = obras.find((o) => o.id === d.id);
          if (!atual) return res.status(404).json({ status: 'error', message: 'Obra não encontrada.' });

          // Descobre a linha real na planilha
          const linhas = await lerAba(sheets, spreadsheetId, RANGE_OBRAS, COLS_OBRAS);
          const alvo = linhas.find((o) => txt(o.id) === d.id);
          const registro = {
            id: d.id,
            tipo,
            titulo,
            titulo_original: txt(d.tituloOriginal),
            ano: num(d.ano) === null ? '' : num(d.ano),
            plataforma: txt(d.plataforma),
            total_episodios: num(d.epTotal) === null ? '' : num(d.epTotal),
            status,
            nota: num(d.nota) === null ? '' : num(d.nota),
            comentario: txt(d.comentario),
            criado_em: atual.criadoEm || agora,
            atualizado_em: agora,
          };
          await escreverLinha(sheets, spreadsheetId, ABA_OBRAS, COLS_OBRAS, alvo._linha, registro);
          return res.status(200).json({ status: 'success', id: d.id, acao: 'editado' });
        }

        const id = proximoId('o', 3, obras.map((o) => o.id));
        const registro = {
          id,
          tipo,
          titulo,
          titulo_original: txt(d.tituloOriginal),
          ano: num(d.ano) === null ? '' : num(d.ano),
          plataforma: txt(d.plataforma),
          total_episodios: num(d.epTotal) === null ? '' : num(d.epTotal),
          status,
          nota: num(d.nota) === null ? '' : num(d.nota),
          comentario: txt(d.comentario),
          criado_em: agora,
          atualizado_em: agora,
        };
        await adicionarLinha(sheets, spreadsheetId, ABA_OBRAS, COLS_OBRAS, registro);
        return res.status(200).json({ status: 'success', id, acao: 'criado' });
      }

      // --- remover uma obra e todos os episódios dela ---
      if (acao === 'removerObra') {
        const id = txt(body.id);
        const linhas = await lerAba(sheets, spreadsheetId, RANGE_OBRAS, COLS_OBRAS);
        const alvo = linhas.find((o) => txt(o.id) === id);
        if (!alvo) return res.status(404).json({ status: 'error', message: 'Obra não encontrada.' });

        const epsDela = await lerAba(sheets, spreadsheetId, RANGE_EPS, COLS_EPS);
        const epsAlvo = epsDela.filter((e) => txt(e.obra_id) === id);

        // Apaga de baixo para cima para as linhas não deslizarem.
        const alvos = [
          { aba: ABA_OBRAS, linhas: [alvo._linha] },
          { aba: ABA_EPS, linhas: epsAlvo.map((e) => e._linha) },
        ];
        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        const idAba = (nome) => meta.data.sheets.find((s) => s.properties.title === nome).properties.sheetId;

        const requests = [];
        for (const { aba, linhas: ls } of alvos) {
          const sid = idAba(aba);
          const ordenadas = ls.slice().sort((a, b) => b - a);
          // Agrupa linhas consecutivas num único deleteDimension
          let fim = null, ini = null;
          for (const l of ordenadas) {
            if (fim === null) { fim = l; ini = l; continue; }
            if (l === ini - 1) { ini = l; continue; }
            requests.push({ deleteDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: ini - 1, endIndex: fim } } });
            fim = l; ini = l;
          }
          if (fim !== null) {
            requests.push({ deleteDimension: { range: { sheetId: sid, dimension: 'ROWS', startIndex: ini - 1, endIndex: fim } } });
          }
        }

        if (requests.length) {
          await sheets.spreadsheets.batchUpdate({ spreadsheetId, requestBody: { requests } });
        }
        return res.status(200).json({ status: 'success', acao: 'removido', episodiosRemovidos: epsAlvo.length });
      }

      // --- marcar um episódio como assistido ---
      if (acao === 'salvarEpisodio') {
        const d = body.episodio || {};
        const obraId = txt(d.obraId);
        const obra = obras.find((o) => o.id === obraId);
        if (!obra) return res.status(404).json({ status: 'error', message: 'Obra não encontrada.' });

        const epsDela = await lerAba(sheets, spreadsheetId, RANGE_EPS, COLS_EPS);
        const id = proximoId('e', 5, epsDela.map((e) => e.id));

        const registro = {
          id,
          obra_id: obraId,
          obra_titulo: obra.titulo,
          data_assistido: txt(d.dataAssistido) || agora,
          data_original: txt(d.dataOriginal),
          temporada: num(d.temporada) === null ? '' : num(d.temporada),
          episodio: num(d.episodio) === null ? '' : num(d.episodio),
          nome_episodio: txt(d.nome),
          duracao_min: num(d.duracaoMin) === null ? '' : num(d.duracaoMin),
          plataforma: txt(d.plataforma) || obra.plataforma,
        };
        await adicionarLinha(sheets, spreadsheetId, ABA_EPS, COLS_EPS, registro);

        // Devolve o progresso recalculado para a tela atualizar na hora
        const atualizada = montarObra(
          { id: obraId, tipo: obra.tipo, titulo: obra.titulo, total_episodios: obra.epTotal,
            status: obra.status, nota: obra.nota, comentario: obra.comentario,
            criado_em: obra.criadoEm, atualizado_em: obra.atualizadoEm },
          epsDela.filter((e) => txt(e.obra_id) === obraId).concat([registro])
        );
        return res.status(200).json({ status: 'success', id, acao: 'episodio', obra: atualizada });
      }

      // --- remover um episódio ---
      if (acao === 'removerEpisodio') {
        const id = txt(body.id);
        const epsDela = await lerAba(sheets, spreadsheetId, RANGE_EPS, COLS_EPS);
        const alvo = epsDela.find((e) => txt(e.id) === id);
        if (!alvo) return res.status(404).json({ status: 'error', message: 'Episódio não encontrado.' });

        const meta = await sheets.spreadsheets.get({ spreadsheetId });
        const sid = meta.data.sheets.find((s) => s.properties.title === ABA_EPS).properties.sheetId;
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{
              deleteDimension: {
                range: { sheetId: sid, dimension: 'ROWS', startIndex: alvo._linha - 1, endIndex: alvo._linha },
              },
            }],
          },
        });
        return res.status(200).json({ status: 'success', acao: 'episodioRemovido' });
      }

      return res.status(400).json({ status: 'error', message: 'Ação desconhecida: ' + acao });
    }

    return res.status(405).json({ status: 'error', message: 'Método não permitido.' });
  } catch (erro) {
    console.error('[assistidos] erro:', erro && erro.message);
    return res.status(500).json({ status: 'error', message: (erro && erro.message) || 'Erro interno' });
  }
}
