const API_URL = "/api";

let estadoPonto = {
    trabalhando: false,
    inicioTurnoMs: null,
    segundosTurnoAtual: 0,
    totalSegundosTrabalhados: 0,
    ultimoTempoTrabalhadoFormatado: "00:00:00"
};

let missoes = [];
let turnosRegistrados = [];
let contadorConcluidas = 0;
let visaoAtual = 'fila'; 
let cicloFolgaAtual = null;

function obterDataHojeStr() {
    const d = new Date();
    return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
}

function encontrarMissaoHoje(id) {
    const hojeStr = obterDataHojeStr();
    let m = missoes.find(x => String(x.id) === String(id) && String(x.data || hojeStr) === hojeStr);
    if (!m) {
        m = missoes.find(x => String(x.id) === String(id));
    }
    return m;
}

function mostrarLoader(status, tempoMs = null) {
    const loader = document.getElementById('globalLoader');
    if (!loader) return;

    if (status) {
        loader.classList.remove('hidden');
        loader.classList.add('flex');
        const txtMs = document.getElementById('loaderMsText');
        if (txtMs && tempoMs !== null) {
            const segs = (tempoMs / 1000).toFixed(1);
            txtMs.innerText = `${segs} s`;
        }
    } else {
        if (tempoMs !== null) {
            const txtMs = document.getElementById('loaderMsText');
            if (txtMs) {
                const segs = (tempoMs / 1000).toFixed(1);
                txtMs.innerText = `${segs} s`;
            }
            setTimeout(() => {
                loader.classList.add('hidden');
                loader.classList.remove('flex');
            }, 800);
        } else {
            loader.classList.add('hidden');
            loader.classList.remove('flex');
        }
    }
}

function mostrarNotificacao(titulo, mensagem, tipo = 'info', duracaoMs = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toastId = 'toast-' + Date.now();
    let corBorda = 'border-purple-500/50';
    let corIcone = 'text-purple-400';
    let iconeFa = 'fa-circle-info';
    let corBarra = 'bg-purple-500';

    if (tipo === 'sucesso') {
        corBorda = 'border-emerald-500/50';
        corIcone = 'text-emerald-400';
        iconeFa = 'fa-circle-check';
        corBarra = 'bg-emerald-500';
    } else if (tipo === 'atencao' || tipo === 'aviso') {
        corBorda = 'border-amber-500/50';
        corIcone = 'text-amber-400';
        iconeFa = 'fa-triangle-exclamation';
        corBarra = 'bg-amber-500';
    } else if (tipo === 'sincronizando') {
        corBorda = 'border-indigo-500/60';
        corIcone = 'text-indigo-400 animate-spin';
        iconeFa = 'fa-rotate';
        corBarra = 'bg-indigo-500';
    }

    const toastEl = document.createElement('div');
    toastEl.id = toastId;
    toastEl.className = `toast-gta pointer-events-auto bg-[#17112d]/95 backdrop-blur-md border ${corBorda} rounded-xl p-3.5 shadow-2xl w-80 flex flex-col space-y-2 relative overflow-hidden`;
    
    toastEl.innerHTML = `
        <div class="flex items-start space-x-3">
            <div class="${corIcone} text-base mt-0.5"><i class="fa-solid ${iconeFa}"></i></div>
            <div class="flex-grow">
                <div class="flex justify-between items-center">
                    <h5 class="text-xs font-bold text-white">${titulo}</h5>
                </div>
                <p class="text-[11px] text-purple-200/80 leading-snug mt-0.5">${mensagem}</p>
            </div>
        </div>
        <div class="w-full bg-[#090614] h-1 rounded-full overflow-hidden mt-1">
            <div id="bar-${toastId}" class="${corBarra} h-full w-full transition-all ease-linear" style="transition-duration: ${duracaoMs}ms;"></div>
        </div>
    `;

    container.appendChild(toastEl);
    setTimeout(() => {
        const bar = document.getElementById(`bar-${toastId}`);
        if (bar) bar.style.width = '0%';
    }, 50);

    setTimeout(() => {
        toastEl.classList.add('hiding');
        setTimeout(() => toastEl.remove(), 300);
    }, duracaoMs);

    return toastId;
}

function iniciarRelogio() {
    function atualizar() {
        const agora = new Date();
        const dia = String(agora.getDate()).padStart(2, '0');
        const mes = String(agora.getMonth() + 1).padStart(2, '0');
        const ano = agora.getFullYear();

        const horas = String(agora.getHours()).padStart(2, '0');
        const minutos = String(agora.getMinutes()).padStart(2, '0');
        const segundos = String(agora.getSeconds()).padStart(2, '0');
        
        const elClock = document.getElementById('clockRealtime');
        const elDate = document.getElementById('dateRealtime');

        if (elClock) elClock.innerText = `${horas}:${minutos}:${segundos}`;
        if (elDate) elDate.innerText = `${dia}/${mes}/${ano}`;

        processarCicloSegundo();
    }

    atualizar();
    setInterval(atualizar, 1000);
}

function processarCicloSegundo() {
    if (estadoPonto.trabalhando && estadoPonto.inicioTurnoMs) {
        const diffMs = Date.now() - estadoPonto.inicioTurnoMs;
        estadoPonto.segundosTurnoAtual = Math.floor(diffMs / 1000);
    }

    const agora = Date.now();

    missoes.forEach(m => {
        if (m.estadoMissao === 'EmAndamento' && m.tempoInicioMs) {
            const elTimer = document.getElementById(`timer-missao-${m.id}`);
            const elAvisoAtraso = document.getElementById(`aviso-atraso-${m.id}`);
            
            const diffSec = Math.floor((agora - m.tempoInicioMs) / 1000);
            if (elTimer) {
                const h = String(Math.floor(diffSec / 3600)).padStart(2, '0');
                const min = String(Math.floor((diffSec % 3600) / 60)).padStart(2, '0');
                const s = String(diffSec % 60).padStart(2, '0');
                elTimer.innerText = `${h}:${min}:${s}`;
            }

            const tempoEstimadoSegundos = m.tempoEstimado * 60;
            if (elAvisoAtraso) {
                if (diffSec > tempoEstimadoSegundos) elAvisoAtraso.classList.remove('hidden');
                else elAvisoAtraso.classList.add('hidden');
            }
        }
    });

    atualizarDisplaysPonto();
}

document.addEventListener('DOMContentLoaded', async () => {
    limparChaveAntiga();

    preencherSelectsComodo();

    carregarDadosLocalStorage();
    renderizarVisaoAtual();
    iniciarRelogio();
    carregarUltimasPreferenciasSelects();

    // Toda vez que a pagina abre, a senha e pedida.
    // O Chrome preenche o formulario se tiver a senha salva.
    abrirModalChave();
});

// =====================================================================
// PAINEL DE LINHAS DA PLANILHA
// Permite ver as linhas reais de cada aba e excluir as que nao servem,
// sem precisar abrir a planilha.
// =====================================================================
let painelLinhas = {
    abas: [],
    abaAtual: null,
    selecionadas: new Set(),   // guarda "aba|linha"
    carregando: false
};

async function abrirModalGerenciarLinhas() {
    const modal = document.getElementById('modalGerenciarLinhas');
    if (!modal) return;
    modal.classList.remove('hidden');
    painelLinhas.selecionadas.clear();
    await carregarLinhasPainel();
}

function fecharModalGerenciarLinhas() {
    const modal = document.getElementById('modalGerenciarLinhas');
    if (modal) modal.classList.add('hidden');
}

async function carregarLinhasPainel() {
    const container = document.getElementById('tabelaLinhasContainer');
    if (container) container.innerHTML = '<p class="text-xs text-purple-300/50 p-6 text-center">Carregando linhas da planilha...</p>';

    painelLinhas.carregando = true;
    try {
        const resp = await chamarAPI(API_URL + '?painel=linhas', { method: 'GET', redirect: 'follow' });
        const json = await resp.json();

        if (!json || json.status !== 'success') {
            throw new Error((json && json.message) || 'Falha ao carregar');
        }

        painelLinhas.abas = json.abas || [];
        if (!painelLinhas.abaAtual || !painelLinhas.abas.some(a => a.aba === painelLinhas.abaAtual)) {
            painelLinhas.abaAtual = painelLinhas.abas.length > 0 ? painelLinhas.abas[0].aba : null;
        }

        renderizarAbasPainel();
        renderizarTabelaLinhas();
    } catch (err) {
        console.error('Erro ao carregar painel de linhas:', err);
        const msgErro = String(err && err.message || '') === 'NAO_AUTORIZADO'
            ? 'Sessão expirada. Entre novamente para continuar.'
            : 'Não foi possível carregar. Tente novamente.';
        if (container) container.innerHTML = '<p class="text-xs text-red-400 p-6 text-center">' + msgErro + '</p>';
    } finally {
        painelLinhas.carregando = false;
    }
}

function renderizarAbasPainel() {
    const box = document.getElementById('abasPainelLinhas');
    if (!box) return;

    box.innerHTML = painelLinhas.abas.map(a => {
        const ativa = a.aba === painelLinhas.abaAtual;
        const classes = ativa
            ? 'bg-purple-600 text-white border-purple-500'
            : 'bg-[#090614] text-purple-300 border-purple-900/60 hover:border-purple-500';
        return `<button onclick="trocarAbaPainel('${a.aba.replace(/'/g, "\\'")}')" class="px-3 py-1.5 rounded-xl text-xs font-mono-code border transition ${classes}">
            ${a.rotulo} <span class="opacity-60">(${a.linhas.length})</span>
        </button>`;
    }).join('');
}

function trocarAbaPainel(nomeAba) {
    painelLinhas.abaAtual = nomeAba;
    const busca = document.getElementById('buscaLinhas');
    if (busca) busca.value = '';
    renderizarAbasPainel();
    renderizarTabelaLinhas();
}

function obterAbaAtual() {
    return painelLinhas.abas.find(a => a.aba === painelLinhas.abaAtual) || null;
}

function renderizarTabelaLinhas() {
    const container = document.getElementById('tabelaLinhasContainer');
    if (!container) return;

    const aba = obterAbaAtual();
    if (!aba) {
        container.innerHTML = '<p class="text-xs text-purple-300/50 p-6 text-center">Nenhuma aba carregada.</p>';
        return;
    }

    const termo = String((document.getElementById('buscaLinhas') || {}).value || '').trim().toLowerCase();
    const linhas = aba.linhas.filter(l =>
        termo === '' || l.celulas.some(v => String(v).toLowerCase().includes(termo))
    );

    if (linhas.length === 0) {
        container.innerHTML = '<p class="text-xs text-purple-300/50 p-6 text-center">Nenhuma linha encontrada.</p>';
        atualizarContadorSelecionadas();
        return;
    }

    const cabecalho = `
        <tr class="bg-[#090614] sticky top-0 z-10">
            <th class="p-2 text-left text-[10px] font-mono-code text-purple-400 border-b border-purple-900/60 w-10">
                <input type="checkbox" onclick="marcarVisiveis(this.checked)" class="accent-purple-500 cursor-pointer">
            </th>
            <th class="p-2 text-left text-[10px] font-mono-code text-purple-400 border-b border-purple-900/60 whitespace-nowrap">Linha</th>
            ${aba.colunas.map(col => `<th class="p-2 text-left text-[10px] font-mono-code text-purple-400 border-b border-purple-900/60 whitespace-nowrap">${col}</th>`).join('')}
        </tr>`;

    const corpo = linhas.map(l => {
        const chave = aba.aba + '|' + l.numeroLinha;
        const marcada = painelLinhas.selecionadas.has(chave);
        return `
            <tr class="hover:bg-purple-900/20 transition ${marcada ? 'bg-red-950/30' : ''}">
                <td class="p-2 border-b border-purple-900/30">
                    <input type="checkbox" ${marcada ? 'checked' : ''} onchange="alternarSelecaoLinha('${chave.replace(/'/g, "\\'")}', this.checked)" class="accent-red-500 cursor-pointer">
                </td>
                <td class="p-2 border-b border-purple-900/30 text-[11px] font-mono-code text-purple-400">${l.numeroLinha}</td>
                ${l.celulas.map(v => `<td class="p-2 border-b border-purple-900/30 text-[11px] text-purple-100/90 max-w-[220px] truncate" title="${String(v).replace(/"/g, '&quot;')}">${v === '' ? '<span class="text-purple-500/30">—</span>' : String(v)}</td>`).join('')}
            </tr>`;
    }).join('');

    container.innerHTML = `<table class="w-full border-collapse">${cabecalho}${corpo}</table>`;
    atualizarContadorSelecionadas();
}

function filtrarLinhasPainel() {
    renderizarTabelaLinhas();
}

function alternarSelecaoLinha(chave, marcada) {
    if (marcada) painelLinhas.selecionadas.add(chave);
    else painelLinhas.selecionadas.delete(chave);
    renderizarTabelaLinhas();
}

function marcarVisiveis(marcar) {
    const aba = obterAbaAtual();
    if (!aba) return;

    const termo = String((document.getElementById('buscaLinhas') || {}).value || '').trim().toLowerCase();
    aba.linhas
        .filter(l => termo === '' || l.celulas.some(v => String(v).toLowerCase().includes(termo)))
        .forEach(l => {
            const chave = aba.aba + '|' + l.numeroLinha;
            if (marcar) painelLinhas.selecionadas.add(chave);
            else painelLinhas.selecionadas.delete(chave);
        });

    renderizarTabelaLinhas();
}

function alternarTodasLinhas() {
    const aba = obterAbaAtual();
    if (!aba) return;
    const todasMarcadas = aba.linhas.every(l => painelLinhas.selecionadas.has(aba.aba + '|' + l.numeroLinha));
    marcarVisiveis(!todasMarcadas);
}

function atualizarContadorSelecionadas() {
    const total = painelLinhas.selecionadas.size;
    const contador = document.getElementById('contadorSelecionadas');
    const botao = document.getElementById('btnExcluirLinhas');
    const btnTodas = document.getElementById('btnMarcarTodas');

    if (contador) contador.textContent = total + ' selecionada(s)';
    if (botao) botao.disabled = total === 0;

    const aba = obterAbaAtual();
    if (btnTodas && aba) {
        const todas = aba.linhas.length > 0 && aba.linhas.every(l => painelLinhas.selecionadas.has(aba.aba + '|' + l.numeroLinha));
        btnTodas.textContent = todas ? 'Desmarcar todas' : 'Marcar todas';
    }
}

async function excluirLinhasSelecionadas() {
    const total = painelLinhas.selecionadas.size;
    if (total === 0) return;

    const resumo = {};
    painelLinhas.selecionadas.forEach(chave => {
        const [aba, linha] = chave.split('|');
        resumo[aba] = (resumo[aba] || 0) + 1;
    });

    const detalhe = Object.keys(resumo).map(a => `• ${a}: ${resumo[a]} linha(s)`).join('\n');

    if (!confirm(`Excluir ${total} linha(s) da planilha?\n\n${detalhe}\n\nEsta ação não pode ser desfeita.`)) return;

    const itens = Array.from(painelLinhas.selecionadas).map(chave => {
        const partes = chave.split('|');
        return { aba: partes[0], linha: parseInt(partes[1], 10) };
    });

    try {
        const resp = await chamarAPI(API_URL, {
            method: 'POST',
            body: JSON.stringify({ acao: 'excluirLinhas', itens: itens })
        });
        const json = await resp.json();

        if (json && json.status === 'success') {
            painelLinhas.selecionadas.clear();
            mostrarNotificacao("Sucesso", `${total} linha(s) excluída(s).`, "sucesso", 2500);
            await carregarLinhasPainel();
            await carregarDadosDoServidor(false);
        } else {
            mostrarNotificacao("Erro", (json && json.message) || "Não foi possível excluir.", "erro", 3000);
        }
    } catch (err) {
        console.error('Erro ao excluir linhas:', err);
        mostrarNotificacao("Erro", "Falha de conexão ao excluir.", "erro", 3000);
    }
}

// =====================================================================
// COMODOS
// Lista unica. Para adicionar um comodo novo, basta incluir aqui:
// os quatro selects do HTML sao preenchidos a partir desta lista.
// =====================================================================
const COMODOS = ['Quarto', 'Banheiro', 'Cozinha', 'Sala', 'Lavanderia', 'Quintal', 'Corredor'];

function preencherSelectsComodo() {
    COMODOS.forEach((comodo, idx) => {
        // 1) Filtro da Fila de Missoes
        const filtroFila = document.getElementById('filtroFilaComodo');
        if (filtroFila && !filtroFila.querySelector('option[value="' + comodo + '"]')) {
            const opt = document.createElement('option');
            opt.value = comodo;
            opt.textContent = comodo;
            filtroFila.appendChild(opt);
        }

        // 2) Filtro do Historico
        const filtroHist = document.getElementById('filtroHistoricoComodo');
        if (filtroHist && !filtroHist.querySelector('option[value="' + comodo + '"]')) {
            const opt = document.createElement('option');
            opt.value = comodo;
            opt.textContent = comodo;
            filtroHist.appendChild(opt);
        }

        // 3) Modal Nova Missao (sem opcao "TODOS")
        const selectNova = document.getElementById('selectComodo');
        if (selectNova && !selectNova.querySelector('option[value="' + comodo + '"]')) {
            const opt = document.createElement('option');
            opt.value = comodo;
            opt.textContent = comodo;
            selectNova.appendChild(opt);
        }

        // 4) Modal Editar Missao
        const selectEdit = document.getElementById('editSelectComodo');
        if (selectEdit && !selectEdit.querySelector('option[value="' + comodo + '"]')) {
            const opt = document.createElement('option');
            opt.value = comodo;
            opt.textContent = comodo;
            selectEdit.appendChild(opt);
        }
    });
}

// =====================================================================
// CHAVE DE ACESSO DA API
// A API recusa qualquer pedido sem o header X-Api-Key.
// A chave e digitada uma vez pelo usuario e guardada no navegador.
// =====================================================================
const CHAVE_STORAGE = 'cq_api_key';

// A chave NAO fica salva no navegador: vive so na memoria desta aba.
// Quem guarda a senha para preencher o formulario e o gerenciador de
// senhas do Chrome. Recarregar a pagina pede a senha de novo.
let chaveEmMemoria = '';

function obterChaveAPI() {
    return chaveEmMemoria;
}

function salvarChaveAPI(chave) {
    chaveEmMemoria = String(chave || '').trim();
}

// Remove qualquer chave que versoes antigas tenham deixado no navegador
function limparChaveAntiga() {
    try { localStorage.removeItem(CHAVE_STORAGE); } catch (e) { /* ignora */ }
}

function cabecalhosAPI(comJson = true) {
    const h = { 'X-Api-Key': obterChaveAPI() };
    if (comJson) h['Content-Type'] = 'application/json';
    return h;
}

// Chama a API. Se voltar 401, abre o modal da chave e lanca um erro
// tratado, para o chamador simplesmente parar sem quebrar a tela.
async function chamarAPI(url, opcoes = {}) {
    const opcoesFinais = {
        ...opcoes,
        headers: { ...cabecalhosAPI(opcoes.body !== undefined), ...(opcoes.headers || {}) }
    };

    const resp = await fetch(url, opcoesFinais);

    if (resp.status === 401) {
        // Se o modal ja esta aberto, nao reabre (evita loop com pedidos paralelos)
        const modalAberto = document.getElementById('modalChaveAcesso');
        const jaVisivel = modalAberto && !modalAberto.classList.contains('hidden');
        if (!jaVisivel) {
            abrirModalChave('Sessão expirada ou senha incorreta. Entre novamente.');
        }
        throw new Error('NAO_AUTORIZADO');
    }

    return resp;
}

// ---- Modal da chave ----
function abrirModalChave(mensagem) {
    let modal = document.getElementById('modalChaveAcesso');

    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'modalChaveAcesso';
        modal.className = 'fixed inset-0 w-screen h-screen bg-[#090614]/95 backdrop-blur-md z-[100] flex items-center justify-center p-4';
        modal.innerHTML = `
            <form id="formChaveAcesso" autocomplete="on" onsubmit="event.preventDefault(); confirmarChaveAcesso();"
                  class="bg-[#17112d] border border-purple-800/80 rounded-2xl max-w-sm w-full p-6 space-y-4 shadow-2xl">
                <div class="border-b border-purple-900/50 pb-3">
                    <h3 class="text-sm font-bold text-white uppercase tracking-wider">
                        <i class="fa-solid fa-lock text-purple-400 mr-2"></i>Entrar
                    </h3>
                </div>
                <p id="chaveMensagem" class="text-xs text-purple-300/70"></p>

                <div class="space-y-1">
                    <label for="inputUsuarioAcesso" class="text-[10px] font-mono-code text-purple-400 uppercase tracking-wider">Usuário</label>
                    <input type="text" id="inputUsuarioAcesso" name="username" autocomplete="username"
                           placeholder="seu usuário"
                           class="w-full bg-[#090614] border border-purple-900/80 rounded-xl px-3 py-2 text-sm text-white placeholder-purple-400/40 focus:outline-none focus:border-purple-500">
                </div>

                <div class="space-y-1">
                    <label for="inputChaveAcesso" class="text-[10px] font-mono-code text-purple-400 uppercase tracking-wider">Senha</label>
                    <input type="password" id="inputChaveAcesso" name="password" autocomplete="current-password"
                           placeholder="sua senha"
                           class="w-full bg-[#090614] border border-purple-900/80 rounded-xl px-3 py-2 text-sm text-white placeholder-purple-400/40 focus:outline-none focus:border-purple-500">
                </div>

                <p id="erroChave" class="text-[11px] text-red-400 hidden"></p>

                <button type="submit" class="w-full bg-purple-600 hover:bg-purple-500 text-white py-2 rounded-xl text-xs font-mono-code font-bold transition">
                    Entrar
                </button>
            </form>
        `;
        document.body.appendChild(modal);
    }

    const msg = modal.querySelector('#chaveMensagem');
    if (msg) msg.textContent = mensagem || 'Digite a chave de acesso para usar o sistema.';

    const erro = modal.querySelector('#erroChave');
    if (erro) erro.classList.add('hidden');

    // O navegador pode preencher usuario e senha sozinho (senha salva no Chrome).
    // Nao sobrescrevemos o campo com a chave antiga para nao atrapalhar o autofill.
    const inputUsuario = modal.querySelector('#inputUsuarioAcesso');
    const inputSenha = modal.querySelector('#inputChaveAcesso');

    if (inputUsuario && !inputUsuario.value) {
        inputUsuario.value = localStorage.getItem('cq_usuario') || '';
    }
    if (inputSenha) inputSenha.value = '';

    modal.classList.remove('hidden');

    setTimeout(() => {
        if (inputUsuario && !inputUsuario.value) inputUsuario.focus();
        else if (inputSenha) inputSenha.focus();
    }, 80);
}

async function confirmarChaveAcesso() {
    const modal = document.getElementById('modalChaveAcesso');
    const input = document.getElementById('inputChaveAcesso');
    const inputUsuario = document.getElementById('inputUsuarioAcesso');
    const erro = document.getElementById('erroChave');
    if (!modal || !input) return;

    const chave = input.value.trim();
    const usuario = inputUsuario ? inputUsuario.value.trim() : '';

    if (!chave) {
        if (erro) { erro.textContent = 'Digite a senha.'; erro.classList.remove('hidden'); }
        return;
    }

    salvarChaveAPI(chave);
    if (usuario) localStorage.setItem('cq_usuario', usuario);

    // Testa a chave com um pedido leve
    try {
        const resp = await fetch(API_URL, { method: 'GET', headers: cabecalhosAPI(false), redirect: 'follow' });
        if (resp.status === 401) {
            if (erro) { erro.textContent = 'Chave incorreta. Tente de novo.'; erro.classList.remove('hidden'); }
            return;
        }
    } catch (e) {
        if (erro) { erro.textContent = 'Sem conexão. Tente de novo.'; erro.classList.remove('hidden'); }
        return;
    }

    modal.classList.add('hidden');
    mostrarNotificacao("Sucesso", "Acesso liberado.", "sucesso", 2000);
    carregarDadosDoServidor(true);
}

async function carregarDadosDoServidor(forcarVerificacao = true) {
    // Sem a senha em memoria, nao faz sentido chamar a API: mostra a tela local
    // e deixa o modal de login cuidar do resto.
    if (!obterChaveAPI()) {
        mostrarLoader(false);
        renderizarVisaoAtual();
        return;
    }

    const inicioMs = performance.now();
    mostrarLoader(true);

    try {
        let urlFinal = API_URL + '?verificarLancamento=' + (forcarVerificacao ? 'sim' : 'sim');
        const response = await chamarAPI(urlFinal, { method: 'GET', redirect: 'follow' });
        const data = await response.json();
        
        const fimMs = performance.now();
        const latenciaMs = fimMs - inicioMs;

        if (data && data.status === "success") {
            if (data.cicloFolga) {
                cicloFolgaAtual = data.cicloFolga;
                atualizarPainelFolga();
            }

            if (data.pontoAtivo !== undefined) {
                if (data.pontoAtivo) {
                    estadoPonto.trabalhando = true;
                    if (data.horaEntradaMs && !estadoPonto.inicioTurnoMs) {
                        estadoPonto.inicioTurnoMs = data.horaEntradaMs;
                    }
                    localStorage.setItem('cq_ponto_trabalhando', 'true');
                    if (estadoPonto.inicioTurnoMs) localStorage.setItem('cq_ponto_inicio', estadoPonto.inicioTurnoMs);
                } else {
                    if (!localStorage.getItem('cq_ponto_inicio')) {
                        estadoPonto.trabalhando = false;
                        estadoPonto.inicioTurnoMs = null;
                        estadoPonto.segundosTurnoAtual = 0;
                        localStorage.setItem('cq_ponto_trabalhando', 'false');
                    }
                }
            }

            if (data.turnos && data.turnos.length > 0) {
                turnosRegistrados = data.turnos;
                const ultimoTurno = data.turnos[data.turnos.length - 1];
                if (ultimoTurno && ultimoTurno["Tempo Trabalhado"]) {
                    estadoPonto.ultimoTempoTrabalhadoFormatado = ultimoTurno["Tempo Trabalhado"];
                }
            }

            // PLANILHA É A FONTE ABSOLUTA DA VERDADE
            if (data.missoes && data.missoes.length > 0) {
                missoes = data.missoes.map(mServidor => {
                    let statusServidor = (mServidor["Status"] || mServidor.status || "Pendente").trim();
                    
                    let estadoObj = {
                        ...mServidor,
                        status: statusServidor,
                        estadoMissao: statusServidor === "Concluído" ? "Concluído" : (statusServidor === "Cancelado" ? "Cancelado" : (statusServidor === "Em Andamento" ? "EmAndamento" : "Pendente"))
                    };

                    // Se a planilha marca Concluído ou Cancelado, limpa qualquer estado temporário local
                    if (estadoObj.status === 'Concluído' || estadoObj.status === 'Cancelado') {
                        estadoObj.tempoInicioMs = null;
                        estadoObj.horaInicioStr = null;
                    } else if (estadoObj.status === 'Em Andamento') {
                        estadoObj.estadoMissao = 'EmAndamento';
                        let mLocal = missoes.find(x => String(x.id) === String(mServidor.id));
                        if (mLocal && mLocal.tempoInicioMs) {
                            estadoObj.tempoInicioMs = mLocal.tempoInicioMs;
                            if (mLocal.horaInicioStr) estadoObj.horaInicioStr = mLocal.horaInicioStr;
                        }
                    } else {
                        estadoObj.tempoInicioMs = null;
                        estadoObj.horaInicioStr = null;
                    }
                    return estadoObj;
                });
            }
            if (data.estatisticas) contadorConcluidas = data.estatisticas.concluidas || 0;
        }

        mostrarLoader(false, latenciaMs);
    } catch (error) {
        console.warn("Aviso offline:", error);
        mostrarLoader(false, performance.now() - inicioMs);
    }

    salvarDadosLocalStorage();
    atualizarDisplaysPonto();
    renderizarVisaoAtual();
}

async function sincronizarComServidorEmSegundoPlano(acao, payload) {
    try {
        const response = await chamarAPI(API_URL, {
            method: "POST",
            body: JSON.stringify({ acao, ...payload })
        });
        const resJson = await response.json();
        if (resJson && resJson.status === 'success') {
            carregarDadosDoServidor(false);
        }
        return resJson;
    } catch (error) {
        console.error("Erro background sync:", error);
        return { status: "error" };
    }
}

async function alternarPonto() {
    if (estadoPonto.trabalhando) {
        const missaoEmAndamento = missoes.find(m => m.estadoMissao === 'EmAndamento' || m.status === 'Em Andamento');
        if (missaoEmAndamento) {
            mostrarNotificacao("Ação Bloqueada", `Conclua a missão "${missaoEmAndamento.titulo}" antes de encerrar o turno!`, "aviso", 4000);
            return;
        }
    }

    const proximoStatus = !estadoPonto.trabalhando;
    
    if (proximoStatus) {
        const dataAtual = new Date();
        const horaEntradaStr = String(dataAtual.getHours()).padStart(2, '0') + ":" + String(dataAtual.getMinutes()).padStart(2, '0') + ":" + String(dataAtual.getSeconds()).padStart(2, '0');
        
        estadoPonto.trabalhando = true;
        estadoPonto.inicioTurnoMs = dataAtual.getTime();
        estadoPonto.segundosTurnoAtual = 0;
        
        localStorage.setItem('cq_ponto_inicio', estadoPonto.inicioTurnoMs);
        localStorage.setItem('cq_ponto_trabalhando', 'true');

        atualizarDisplaysPonto();
        mostrarNotificacao("Ponto Registrado", "Turno iniciado instantaneamente!", "sucesso", 2000);

        sincronizarComServidorEmSegundoPlano('baterPonto', { status: 'ENTRADA', horaExata: horaEntradaStr });
    } else {
        const duracaoSegs = estadoPonto.segundosTurnoAtual;
        
        estadoPonto.trabalhando = false;
        estadoPonto.inicioTurnoMs = null;
        estadoPonto.segundosTurnoAtual = 0;
        
        localStorage.removeItem('cq_ponto_inicio');
        localStorage.setItem('cq_ponto_trabalhando', 'false');

        atualizarDisplaysPonto();
        mostrarNotificacao("Turno Encerrado", "Você entrou em folga.", "atencao", 2000);

        sincronizarComServidorEmSegundoPlano('baterPonto', { status: 'SAIDA', duracaoSegundos: duracaoSegs });
    }
    salvarDadosLocalStorage();
}

function atualizarDisplaysPonto() {
    const elTimerTurno = document.getElementById('timerTurnoActual');
    const elLabelTitulo = document.getElementById('labelTurnoTitulo');

    if (estadoPonto.trabalhando) {
        const hTurno = String(Math.floor(estadoPonto.segundosTurnoAtual / 3600)).padStart(2, '0');
        const mTurno = String(Math.floor((estadoPonto.segundosTurnoAtual % 3600) / 60)).padStart(2, '0');
        const sTurno = String(estadoPonto.segundosTurnoAtual % 60).padStart(2, '0');
        if (elTimerTurno) elTimerTurno.innerText = `${hTurno}:${mTurno}:${sTurno}`;
        if (elLabelTitulo) elLabelTitulo.innerText = "Tempo em Turno";
    } else {
        if (elTimerTurno) elTimerTurno.innerText = estadoPonto.ultimoTempoTrabalhadoFormatado || "00:00:00";
        if (elLabelTitulo) elLabelTitulo.innerText = "Último Turno";
    }

    const badge = document.getElementById('badgePontoStatus');
    const textStatus = document.getElementById('textPontoStatus');
    const btnLabel = document.getElementById('btnPontoLabel');

    if (badge && textStatus && btnLabel) {
        if (estadoPonto.trabalhando) {
            badge.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping';
            textStatus.innerText = 'EM SERVIÇO';
            textStatus.className = 'text-xs font-bold font-mono-code text-emerald-400';
            btnLabel.innerText = 'Encerrar Turno';
        } else {
            badge.className = 'w-2.5 h-2.5 rounded-full bg-[#64748b]';
            textStatus.innerText = 'DE FOLGA';
            textStatus.className = 'text-xs font-bold font-mono-code text-slate-400';
            btnLabel.innerText = 'Bater Ponto';
        }
    }

    atualizarEstatisticasGerais();
}

function mudarVisaoPrincipal(visao) {
    visaoAtual = visao;
    const btnFila = document.getElementById('btnVisaoFila');
    const btnHist = document.getElementById('btnVisaoHistorico');
    const secFila = document.getElementById('secaoFilaMissoes');
    const secHist = document.getElementById('secaoHistoricoGeral');
    const boxFiltrosFila = document.getElementById('filtrosFilaContainer');
    const boxFiltrosHist = document.getElementById('filtrosHistoricoHeaderContainer');

    if (visao === 'fila') {
        btnFila.className = 'px-3.5 py-1.5 rounded-xl text-xs font-mono-code bg-purple-600 text-white font-bold transition shadow-md';
        btnHist.className = 'px-3.5 py-1.5 rounded-xl text-xs font-mono-code bg-[#17112d] text-purple-300 border border-purple-900/60 hover:border-purple-500 transition';
        secFila.classList.remove('hidden');
        secHist.classList.add('hidden');
        if(boxFiltrosFila) boxFiltrosFila.classList.remove('hidden');
        if(boxFiltrosHist) boxFiltrosHist.classList.add('hidden');
        renderizarMissoes();
    } else {
        btnHist.className = 'px-3.5 py-1.5 rounded-xl text-xs font-mono-code bg-purple-600 text-white font-bold transition shadow-md';
        btnFila.className = 'px-3.5 py-1.5 rounded-xl text-xs font-mono-code bg-[#17112d] text-purple-300 border border-purple-900/60 hover:border-purple-500 transition';
        secHist.classList.remove('hidden');
        secFila.classList.add('hidden');
        if(boxFiltrosFila) boxFiltrosFila.classList.add('hidden');
        if(boxFiltrosHist) boxFiltrosHist.classList.remove('hidden');
        renderizarHistoricoGeral();
    }
}

function abrirModalNovaMissao() {
    const modal = document.getElementById('modalNovaMissao');
    if (modal) modal.classList.remove('hidden');
}

function fecharModalNovaMissao() {
    const modal = document.getElementById('modalNovaMissao');
    if (modal) modal.classList.add('hidden');
}

async function cadastrarMissao(event) {
    event.preventDefault();

    const titulo = document.getElementById('inputTitulo').value.trim();
    const comodo = document.getElementById('selectComodo').value;
    const tempoEst = parseInt(document.getElementById('inputTempoEstimado').value, 10);
    const prioridade = document.getElementById('selectPrioridade').value;
    const freqEl = document.getElementById('inputFrequencia');
    const frequenciaDias = parseInt(freqEl ? freqEl.value : 1, 10) || 1;
    const missaoUnicaEl = document.getElementById('inputUnica');
    const missaoUnica = missaoUnicaEl ? missaoUnicaEl.checked : false;

    if (!titulo) return;

    localStorage.setItem('cq_last_comodo', comodo);
    localStorage.setItem('cq_last_prioridade', prioridade);

    const hojeStr = obterDataHojeStr();

    const novaMissao = {
        id: Date.now(),
        data: hojeStr,
        titulo: titulo,
        comodo: comodo,
        tempoEstimado: tempoEst,
        frequenciaDias: frequenciaDias,
        prioridade: prioridade,
        status: 'Pendente',
        estadoMissao: 'Pendente',
        tempoInicioMs: null,
        horaInicioStr: null,
        missaoUnica: missaoUnica
    };

    missoes.push(novaMissao);
    salvarDadosLocalStorage();
    renderizarVisaoAtual();

    document.getElementById('formNovaMissao').reset();
    if (missaoUnicaEl) missaoUnicaEl.checked = false;
    fecharModalNovaMissao();
    carregarUltimasPreferenciasSelects();
    mostrarNotificacao("Sucesso", "Missão adicionada instantaneamente.", "sucesso", 2000);

    sincronizarComServidorEmSegundoPlano('adicionarMissao', novaMissao).then(resposta => {
        if (resposta && resposta.status === 'success' && resposta.id) {
            novaMissao.id = resposta.id;
            salvarDadosLocalStorage();
            renderizarVisaoAtual();
        }
    });
}

function abrirModalDuplicarRapido() {
    const modal = document.getElementById('modalDuplicarRapido');
    const container = document.getElementById('listaOpcoesDuplicar');
    if (!modal || !container) return;

    const hojeStr = obterDataHojeStr();
    const unicasBase = {};

    // Somente missoes de HOJE. A chave inclui o comodo, para nao misturar
    // "Juntar o lixo" do Quarto com "Juntar o lixo" da Sala.
    missoes
        .filter(m => String(m.data || hojeStr).trim() === hojeStr)
        .forEach(m => {
            const tituloBaseClean = String(m.titulo || '').replace(/\s+(I|II|III|IV|V|VI|VII|VIII|IX|X)$/i, '').trim();
            const chave = tituloBaseClean.toLowerCase() + '|' + String(m.comodo || '').trim().toLowerCase();
            if (!unicasBase[chave]) {
                unicasBase[chave] = { ...m, _tituloBase: tituloBaseClean };
            }
        });

    const lista = Object.values(unicasBase);
    if (lista.length === 0) {
        container.innerHTML = `<p class="text-xs text-purple-300/50 p-3 text-center">Nenhuma missão de hoje disponível para repetir.</p>`;
    } else {
        container.innerHTML = lista.map(m => `
            <div onclick="duplicarMissaoPorTitulo('${String(m._tituloBase).replace(/'/g, "\\'")}', '${String(m.comodo || '').replace(/'/g, "\\'")}')" class="bg-[#090614] border border-purple-900/60 p-3 rounded-xl hover:border-purple-500 cursor-pointer transition flex justify-between items-center">
                <div>
                    <h4 class="font-bold text-xs text-white">${m._tituloBase}</h4>
                    <p class="text-[10px] text-purple-300/60">${m.comodo} • tempo missão: ${m.tempoEstimado} min</p>
                </div>
                <span class="text-xs bg-purple-600/20 text-purple-300 px-2.5 py-1 rounded-lg font-mono-code"><i class="fa-solid fa-plus mr-1"></i> Repetir</span>
            </div>
        `).join('');
    }

    modal.classList.remove('hidden');
}

function fecharModalDuplicarRapido() {
    const modal = document.getElementById('modalDuplicarRapido');
    if (modal) modal.classList.add('hidden');
}

async function duplicarMissaoPorTitulo(tituloOriginal, comodoOriginal) {
    fecharModalDuplicarRapido();

    const hojeStr = obterDataHojeStr();
    const alvoLower = String(tituloOriginal || '').trim().toLowerCase();
    const comodoAlvo = String(comodoOriginal || '').trim().toLowerCase();

    // Busca apenas entre as missoes de HOJE, do mesmo comodo, com o titulo exato
    // (ou titulo + sufixo romano). Evita pegar a missao de outro dia.
    const missaoRef = missoes.find(m => {
        if (String(m.data || hojeStr).trim() !== hojeStr) return false;
        if (comodoAlvo && String(m.comodo || '').trim().toLowerCase() !== comodoAlvo) return false;
        const base = String(m.titulo || '').replace(/\s+(I|II|III|IV|V|VI|VII|VIII|IX|X)$/i, '').trim().toLowerCase();
        return base === alvoLower;
    });
    if (!missaoRef) {
        mostrarNotificacao("Aviso", "Missão de hoje não encontrada para repetir.", "erro", 2500);
        return;
    }

    // --- Separar titulo base do sufixo romano ---
    // "Juntar o lixo II" -> base "Juntar o lixo", romano 2
    // "Juntar o lixo"    -> base "Juntar o lixo", romano 1  (a original conta como I)
    const romanos = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X',
                     'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX'];

    // Mapa numero -> romano, para nao depender da posicao do array
    const intParaRomano = (n) => {
        const tabela = [[10,'X'],[9,'IX'],[5,'V'],[4,'IV'],[1,'I']];
        let resto = n, saida = '';
        for (const [v, s] of tabela) {
            while (resto >= v) { saida += s; resto -= v; }
        }
        return saida || 'I';
    };

    // Mapa romano -> numero
    const romanoParaInt = (r) => {
        const val = { I: 1, V: 5, X: 10, L: 50, C: 100 };
        let total = 0, anterior = 0;
        for (const ch of String(r).toUpperCase().split('').reverse()) {
            const v = val[ch] || 0;
            if (v < anterior) total -= v; else { total += v; anterior = v; }
        }
        return total;
    };

    const separarSufixo = (titulo) => {
        const t = String(titulo || '').trim();
        const m = t.match(/^(.*?)\s+([IVXLC]+)$/i);
        if (!m) return { base: t, romano: 0 };   // sem sufixo: romano 0 = "original"
        const n = romanoParaInt(m[2]);
        if (n <= 0) return { base: t, romano: 0 };
        return { base: m[1].trim(), romano: n };
    };

    const ref = separarSufixo(missaoRef.titulo);
    const baseRef = ref.base;
    const baseLower = baseRef.toLowerCase();
    const comodoRef = String(missaoRef.comodo || '').trim().toLowerCase();

    // --- Filtrar: 1) do dia  2) do mesmo comodo  3) mesmo titulo base ---
    let maiorRomano = 0;

    missoes.forEach(m => {
        if (String(m.data || '').trim() !== hojeStr) return;                 // 1) somente hoje
        if (String(m.comodo || '').trim().toLowerCase() !== comodoRef) return; // 2) somente o comodo
        const s = separarSufixo(m.titulo);
        if (s.base.toLowerCase() !== baseLower) return;                       // 3) somente o titulo
        // Original (sem sufixo) vale 1; "II" vale 2; "III" vale 3...
        const peso = s.romano === 0 ? 1 : s.romano;
        if (peso > maiorRomano) maiorRomano = peso;
    });

    // Proximo = maior encontrado + 1. Sem nenhuma ocorrencia -> "I".
    const proximoNum = maiorRomano + 1;
    const proximoSufixo = intParaRomano(proximoNum);
    const tituloNovo = `${baseRef} ${proximoSufixo}`;

    const novaMissaoDuplicada = {
        id: Date.now(),
        data: hojeStr,
        titulo: tituloNovo,
        comodo: missaoRef.comodo,
        tempoEstimado: missaoRef.tempoEstimado,
        prioridade: missaoRef.prioridade,
        status: 'Pendente',
        estadoMissao: 'Pendente',
        tempoInicioMs: null,
        horaInicioStr: null,
        missaoUnica: true
    };

    missoes.push(novaMissaoDuplicada);
    salvarDadosLocalStorage();
    renderizarVisaoAtual();
    mostrarNotificacao("Sucesso", `Missão repetida: ${tituloNovo}`, "sucesso", 2000);

    sincronizarComServidorEmSegundoPlano('adicionarMissao', { ...novaMissaoDuplicada, repeticao: true }).then(resposta => {
        if (resposta && resposta.status === 'success' && resposta.id) {
            novaMissaoDuplicada.id = resposta.id;
            salvarDadosLocalStorage();
            renderizarVisaoAtual();
        }
    });
}

function carregarUltimasPreferenciasSelects() {
    const lastComodo = localStorage.getItem('cq_last_comodo');
    const lastPrioridade = localStorage.getItem('cq_last_prioridade');
    if (lastComodo) {
        const sel = document.getElementById('selectComodo');
        if (sel) sel.value = lastComodo;
    }
    if (lastPrioridade) {
        const selP = document.getElementById('selectPrioridade');
        if (selP) selP.value = lastPrioridade;
    }
}

function abrirModalEdicao(id) {
    const missao = encontrarMissaoHoje(id);
    if (!missao) return;

    if (missao.status === 'Concluído') {
        mostrarNotificacao("Bloqueado", "Você não pode editar uma missão já concluída.", "aviso");
        return;
    }

    const elId = document.getElementById('editIdMissao');
    const elTituloOriginal = document.getElementById('editTituloOriginal');
    const elTitulo = document.getElementById('editInputTitulo');
    const elComodo = document.getElementById('editSelectComodo');
    const elTempo = document.getElementById('editInputTempoEstimado');
    const elPrioridade = document.getElementById('editSelectPrioridade');
    const elUnica = document.getElementById('editInputUnica');

    if (elId) elId.value = missao.id;
    if (elTituloOriginal) elTituloOriginal.value = missao.titulo;
    if (elTitulo) elTitulo.value = missao.titulo;
    if (elComodo) elComodo.value = missao.comodo;
    if (elTempo) elTempo.value = missao.tempoEstimado;
    if (elPrioridade) elPrioridade.value = missao.prioridade;
    if (elUnica) elUnica.checked = !!missao.missaoUnica;

    const modal = document.getElementById('modalEditarMissao');
    if (modal) modal.classList.remove('hidden');
}

function fecharModalEdicao() {
    const modal = document.getElementById('modalEditarMissao');
    if (modal) modal.classList.add('hidden');
}

async function salvarEdicaoMissao(event) {
    event.preventDefault();

    const id = document.getElementById('editIdMissao').value;
    const tituloOriginal = document.getElementById('editTituloOriginal').value;
    const missao = encontrarMissaoHoje(id);
    if (!missao) return;

    const tituloNovo = document.getElementById('editInputTitulo').value.trim();
    const comodoNovo = document.getElementById('editSelectComodo').value;
    const tempoNovo = parseInt(document.getElementById('editInputTempoEstimado').value, 10);
    const prioridadeNova = document.getElementById('editSelectPrioridade').value;

    missao.titulo = tituloNovo;
    missao.comodo = comodoNovo;
    missao.tempoEstimado = tempoNovo;
    missao.prioridade = prioridadeNova;
    
    const elUnica = document.getElementById('editInputUnica');
    if (elUnica) missao.missaoUnica = elUnica.checked;

    salvarDadosLocalStorage();
    renderizarVisaoAtual();
    fecharModalEdicao();

    sincronizarComServidorEmSegundoPlano('editarMissao', {
        id: missao.id,
        tituloOriginal: tituloOriginal,
        titulo: tituloNovo,
        comodo: comodoNovo,
        tempoEstimado: tempoNovo,
        prioridade: prioridadeNova
    });
}

function iniciarMissao(id) {
    if (!estadoPonto.trabalhando) {
        mostrarNotificacao("Atenção", "Você está de folga! Bata o ponto para iniciar.", "aviso");
        return;
    }

    const missao = encontrarMissaoHoje(id);
    if (missao) {
        const dataAtual = new Date();
        const horaInicioExata = String(dataAtual.getHours()).padStart(2, '0') + ":" + String(dataAtual.getMinutes()).padStart(2, '0') + ":" + String(dataAtual.getSeconds()).padStart(2, '0');

        missao.estadoMissao = 'EmAndamento';
        missao.status = 'Em Andamento';
        missao.tempoInicioMs = dataAtual.getTime();
        missao.horaInicioStr = String(dataAtual.getHours()).padStart(2, '0') + ":" + String(dataAtual.getMinutes()).padStart(2, '0');
        
        salvarDadosLocalStorage();
        renderizarVisaoAtual();
        
        mostrarNotificacao("Missão Iniciada", `Cronômetro rodando para: ${missao.titulo}`, "sucesso", 2000);

        sincronizarComServidorEmSegundoPlano('atualizarEstadoMissao', { id: missao.id, estadoMissao: 'EmAndamento', horaExata: horaInicioExata });
    }
}

function concluirMissao(id) {
    if (!estadoPonto.trabalhando) {
        mostrarNotificacao("Atenção", "Você está de folga!", "aviso");
        return;
    }

    const missao = encontrarMissaoHoje(id);
    if (!missao) return;

    const dataAtual = new Date();
    const horaTerminoExata = String(dataAtual.getHours()).padStart(2, '0') + ":" + String(dataAtual.getMinutes()).padStart(2, '0') + ":" + String(dataAtual.getSeconds()).padStart(2, '0');

    let horaInicioExata = missao.horaInicioStr || "";
    if (missao.tempoInicioMs) {
        const dInicio = new Date(missao.tempoInicioMs);
        horaInicioExata = String(dInicio.getHours()).padStart(2, '0') + ":" + String(dInicio.getMinutes()).padStart(2, '0') + ":" + String(dInicio.getSeconds()).padStart(2, '0');
    }

    if (missao.tempoInicioMs) {
        const diffMin = Math.round((dataAtual.getTime() - missao.tempoInicioMs) / 60000);
        missao.tempoRealMin = diffMin > 0 ? diffMin : 1;
    } else {
        missao.tempoRealMin = missao.tempoEstimado;
    }

    missao.status = 'Concluído';
    missao.estadoMissao = 'Concluído';
    missao.tempoInicioMs = null;
    missao.horaInicioStr = null;
    contadorConcluidas++;

    salvarDadosLocalStorage();
    renderizarVisaoAtual();
    
    mostrarNotificacao("Missão Concluída!", "Tarefa finalizada com sucesso.", "sucesso", 2500);

    sincronizarComServidorEmSegundoPlano('concluirMissao', { 
        id: missao.id,
        titulo: missao.titulo,
        horaInicio: horaInicioExata,
        horaExata: horaTerminoExata,
        tempoEst: missao.tempoEstimado
    });
}

function alternarNaoFazerHoje(id) {
    const missao = encontrarMissaoHoje(id);
    if (missao) {
        missao.status = 'Cancelado';
        missao.estadoMissao = 'Cancelado';
        missao.tempoInicioMs = null;
        missao.horaInicioStr = null;
        
        salvarDadosLocalStorage();
        renderizarVisaoAtual();
        mostrarNotificacao("Cancelado", "Missão cancelada para hoje.", "atencao", 2000);

        sincronizarComServidorEmSegundoPlano('atualizarEstadoMissao', { id: missao.id, estadoMissao: 'Cancelado' });
    }
}

function excluirMissao(id) {
    const hojeStr = obterDataHojeStr();
    missoes = missoes.filter(m => !(String(m.id) === String(id) && String(m.data || hojeStr) === hojeStr));
    salvarDadosLocalStorage();
    renderizarVisaoAtual();
    mostrarNotificacao("Excluído", "Missão removida.", "atencao", 2000);
    sincronizarComServidorEmSegundoPlano('excluirMissao', { id });
}

function getIconeComodo(comodo) {
    switch (comodo) {
        case 'Quarto': return 'fa-bed';
        case 'Banheiro': return 'fa-sink';
        case 'Corredor': return 'fa-road';
        case 'Cozinha': return 'fa-utensils';
        case 'Sala': return 'fa-tv';
        case 'Lavanderia': return 'fa-shirt';
        case 'Quintal': return 'fa-tree';
        default: return 'fa-broom';
    }
}

function renderizarVisaoAtual() {
    if (visaoAtual === 'fila') {
        renderizarMissoes();
    } else {
        renderizarHistoricoGeral();
    }
    atualizarEstatisticasGerais();
}

function renderizarMissoes() {
    const container = document.getElementById('listaMissoesContainer');
    if (!container) return;

    const hojeStr = obterDataHojeStr();

    const fComodo = document.getElementById('filtroFilaComodo') ? document.getElementById('filtroFilaComodo').value : 'TODOS';
    const fPrioridade = document.getElementById('filtroFilaPrioridade') ? document.getElementById('filtroFilaPrioridade').value : 'TODOS';

    const missoesAtivas = missoes.filter(m => {
        if (m.data && m.data !== hojeStr) return false;
        const stAtual = (m.status || '').trim();
        if (stAtual === 'Concluído' || stAtual === 'Cancelado') return false;
        if (fComodo !== 'TODOS' && m.comodo !== fComodo) return false;
        if (fPrioridade !== 'TODOS' && m.prioridade !== fPrioridade) return false;
        return true;
    });

    const pesoPrioridade = { 'Alta': 1, 'Média': 2, 'Baixa': 3 };
    missoesAtivas.sort((a, b) => {
        const aEmAndamento = (a.estadoMissao === 'EmAndamento' || a.status === 'Em Andamento') ? 0 : 1;
        const bEmAndamento = (b.estadoMissao === 'EmAndamento' || b.status === 'Em Andamento') ? 0 : 1;
        if (aEmAndamento !== bEmAndamento) return aEmAndamento - bEmAndamento;
        return (pesoPrioridade[a.prioridade] || 2) - (pesoPrioridade[b.prioridade] || 2);
    });

    if (missoesAtivas.length === 0) {
        container.innerHTML = `
            <div class="bg-[#17112d] border border-purple-900/50 p-8 rounded-2xl text-center space-y-2">
                <i class="fa-solid fa-check-double text-2xl text-purple-400/50"></i>
                <p class="text-xs text-purple-200/70 font-mono-code">Nenhuma missão encontrada na fila com esses filtros.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = missoesAtivas.map(m => {
        let isUrgent = m.prioridade === 'Alta';
        let botoesAcao = '';
        let statusBadge = '';
        let emAndamento = m.estadoMissao === 'EmAndamento' || m.status === 'Em Andamento';

        let infoDinamicaInicioEPrevisao = '';
        if (emAndamento && m.tempoInicioMs) {
            let dataInicio = new Date(m.tempoInicioMs);
            let horaInicioFmt = m.horaInicioStr || (String(dataInicio.getHours()).padStart(2, '0') + ":" + String(dataInicio.getMinutes()).padStart(2, '0'));
            
            let dataTerminoPrev = new Date(m.tempoInicioMs + (m.tempoEstimado * 60000));
            let previsaoFmt = String(dataTerminoPrev.getHours()).padStart(2, '0') + ":" + String(dataTerminoPrev.getMinutes()).padStart(2, '0');

            infoDinamicaInicioEPrevisao = `
                <span class="bg-[#090614] text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30">
                    Início: ${horaInicioFmt}
                </span>
                <span class="bg-[#090614] text-indigo-300 px-2 py-0.5 rounded border border-indigo-500/30">
                    Previsão Término: ${previsaoFmt}
                </span>
            `;
        }

        if (!emAndamento) {
            statusBadge = '<span class="text-[9px] bg-purple-500/10 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded font-mono-code">PENDENTE</span>';
            botoesAcao = `
                <button onclick="abrirModalEdicao('${m.id}')" class="text-purple-300/50 hover:text-purple-300 px-2 py-2 text-xs transition" title="Editar">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button onclick="alternarNaoFazerHoje('${m.id}')" class="text-slate-400 hover:text-amber-400 px-2 py-2 text-xs transition" title="Não fazer hoje">
                    <i class="fa-solid fa-ban"></i>
                </button>
                <button onclick="iniciarMissao('${m.id}')" class="bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-xl text-xs font-mono-code transition flex items-center space-x-1.5 shadow-md">
                    <i class="fa-solid fa-play"></i>
                    <span>Iniciar</span>
                </button>
            `;
        } else {
            statusBadge = '<span class="text-[9px] bg-amber-500/10 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded font-mono-code animate-pulse">EM ANDAMENTO</span>';
            botoesAcao = `
                <button onclick="abrirModalEdicao('${m.id}')" class="text-purple-300/50 hover:text-purple-300 px-2 py-2 text-xs transition mr-1" title="Editar">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <div class="flex items-center space-x-2 mr-2 font-mono-code text-xs text-amber-400 bg-[#090614] px-2.5 py-1 rounded-lg border border-amber-500/30">
                    <i class="fa-solid fa-stopwatch animate-spin"></i>
                    <span id="timer-missao-${m.id}">00:00:00</span>
                </div>
                <button onclick="concluirMissao('${m.id}')" class="bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold px-3 py-2 rounded-xl text-xs font-mono-code transition flex items-center space-x-1.5 shadow-md">
                    <i class="fa-solid fa-check"></i>
                    <span>Finalizar</span>
                </button>
            `;
        }

        return `
            <div class="bg-[#17112d] border ${isUrgent && !emAndamento ? 'card-urgent border-amber-500/50' : 'border-purple-900/50'} p-4 rounded-xl flex items-center justify-between hover:border-purple-500/50 transition">
                <div class="flex items-start space-x-3.5">
                    <div class="w-10 h-10 rounded-xl bg-[#231a42] border border-purple-800/60 flex items-center justify-center text-purple-400 mt-0.5 font-bold">
                        <i class="fa-solid ${getIconeComodo(m.comodo)}"></i>
                    </div>
                    <div>
                        <div class="flex items-center space-x-2">
                            <h4 class="font-bold text-sm text-white">${m.titulo}</h4>
                            ${statusBadge}
                            ${m.missaoUnica ? '<span class="text-[9px] bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded font-mono-code">ÚNICA</span>' : ''}
                        </div>
                        <p class="text-xs text-purple-300/70 mt-0.5">${m.comodo} • ID: ${m.id}</p>
                        
                        <div class="flex flex-wrap items-center gap-1.5 mt-2 font-mono-code text-[10px]">
                            <span class="bg-[#090614] text-purple-300 px-2 py-0.5 rounded border border-purple-900/60">
                                Prioridade: ${m.prioridade}
                            </span>
                            <span class="bg-[#090614] text-purple-200 px-2 py-0.5 rounded border border-purple-900/60">
                                tempo missão: ${m.tempoEstimado} min
                            </span>
                            ${infoDinamicaInicioEPrevisao}
                            <span id="aviso-atraso-${m.id}" class="hidden bg-red-950/40 text-red-400 px-2 py-0.5 rounded border border-red-900/60 animate-pulse font-bold">
                                ⚠️ ATRASADO
                            </span>
                        </div>
                    </div>
                </div>

                <div class="flex items-center space-x-2">
                    ${botoesAcao}
                    <button onclick="excluirMissao('${m.id}')" class="text-purple-300/40 hover:text-red-400 px-2 py-2 text-xs transition" title="Excluir">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

function renderizarHistoricoGeral() {
    const container = document.getElementById('listaHistoricoContainer');
    if (!container) return;

    const fComodo = document.getElementById('filtroHistoricoComodo').value;
    const fStatus = document.getElementById('filtroHistoricoStatus').value;
    const inputDataVal = document.getElementById('filtroHistoricoData').value; 

    let fDataFormatted = '';
    if (inputDataVal) {
        const [ano, mes, dia] = inputDataVal.split('-');
        fDataFormatted = `${dia}/${mes}/${ano}`;
    }

    let filtradas = missoes.filter(m => {
        if (fComodo !== 'TODOS' && m.comodo !== fComodo) return false;
        const st = (m.status || 'Pendente').trim();
        if (fStatus !== 'TODOS' && st !== fStatus) return false;
        if (fDataFormatted !== '' && !(m.data || '').includes(fDataFormatted)) return false;
        return true;
    });

    if (filtradas.length === 0) {
        container.innerHTML = `
            <div class="bg-[#17112d] border border-purple-900/50 p-8 rounded-2xl text-center space-y-2">
                <i class="fa-solid fa-filter-circle-xmark text-2xl text-purple-400/50"></i>
                <p class="text-xs text-purple-200/70 font-mono-code">Nenhum registro encontrado com esses filtros.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtradas.map(m => {
        const st = (m.status || 'Pendente').trim();
        let corStatus = 'text-purple-300 bg-purple-500/10 border-purple-500/30';
        if (st === 'Concluído') corStatus = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
        if (st === 'Cancelado') corStatus = 'text-red-400 bg-red-500/10 border-red-500/30';

        return `
            <div class="bg-[#17112d] border border-purple-900/50 p-3.5 rounded-xl flex items-center justify-between">
                <div class="flex items-center space-x-3">
                    <div class="w-8 h-8 rounded-lg bg-[#231a42] border border-purple-800/60 flex items-center justify-center text-purple-400 font-bold text-xs">
                        <i class="fa-solid ${getIconeComodo(m.comodo)}"></i>
                    </div>
                    <div>
                        <div class="flex items-center space-x-2">
                            <h4 class="font-bold text-xs text-white">${m.titulo}</h4>
                            <span class="text-[9px] ${corStatus} border px-1.5 py-0.5 rounded font-mono-code">${st}</span>
                        </div>
                        <p class="text-[11px] text-purple-300/60 mt-0.5">${m.comodo} • Data: ${m.data || 'N/D'} • tempo missão: ${m.tempoEstimado} min</p>
                    </div>
                </div>
                <span class="text-[10px] font-mono-code text-purple-300/40">ID: ${m.id}</span>
            </div>
        `;
    }).join('');
}

function limparFiltroData() {
    const el = document.getElementById('filtroHistoricoData');
    if (el) {
        el.value = '';
        renderizarHistoricoGeral();
    }
}

function abrirDetalhesComodo(comodo, statusFiltro = 'Concluído') {
    const modal = document.getElementById('modalDetalhesComodo');
    const titulo = document.getElementById('modalComodoTitulo');
    const conteudo = document.getElementById('modalComodoConteudo');
    if (!modal || !conteudo) return;

    const statusTexto = statusFiltro === 'Concluído' ? 'Concluídas' : 'Pendentes';
    const corClass = statusFiltro === 'Concluído' ? 'text-emerald-400' : 'text-amber-400';
    titulo.className = `text-sm font-bold ${corClass} uppercase tracking-wider`;
    titulo.innerText = `Missões ${statusTexto} em: ${comodo}`;

    const hojeStr = obterDataHojeStr();
    const missoesDoComodo = missoes.filter(m => {
        if (m.comodo !== comodo || m.data !== hojeStr) return false;
        const st = (m.status || '').trim();
        if (statusFiltro === 'Concluído') {
            return st === 'Concluído';
        } else {
            return st !== 'Concluído' && st !== 'Cancelado';
        }
    });

    if (missoesDoComodo.length === 0) {
        conteudo.innerHTML = `<p class="text-xs text-purple-300/50 p-4 text-center">Nenhuma missão ${statusTexto.toLowerCase()} neste cômodo hoje.</p>`;
    } else {
        conteudo.innerHTML = missoesDoComodo.map(m => {
            const st = (m.status || 'Pendente').trim();
            const badgeBg = statusFiltro === 'Concluído' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30';
            return `
                <div class="bg-[#090614] border border-purple-900/60 p-3 rounded-xl space-y-1">
                    <div class="flex justify-between items-center">
                        <span class="text-xs font-bold text-white">${m.titulo}</span>
                        <span class="text-[10px] font-mono-code ${badgeBg} px-2 py-0.5 rounded border">${st}</span>
                    </div>
                    <p class="text-[11px] text-purple-300/70 font-mono-code">tempo missão: ${m.tempoEstimado} min • Prioridade: ${m.prioridade}</p>
                </div>
            `;
        }).join('');
    }

    modal.classList.remove('hidden');
}

function fecharModalDetalhesComodo() {
    const modal = document.getElementById('modalDetalhesComodo');
    if (modal) modal.classList.add('hidden');
}

function atualizarEstatisticasGerais() {
    const hojeStr = obterDataHojeStr();

    let pendentesPorComodo = {};
    let concluidasPorComodo = {};
    let pendentesTotal = 0;
    let concluidasTotal = 0;
    let tempoTotalPrevistoMin = 0;
    let creditosEconomizadosMin = 0;

    missoes.forEach(m => {
        if (m.data === hojeStr) {
            let comodoKey = m.comodo || 'Outros';
            let st = (m.status || '').trim();

            if (st === 'Concluído') {
                concluidasTotal++;
                concluidasPorComodo[comodoKey] = (concluidasPorComodo[comodoKey] || 0) + 1;

                let tempoEst = parseFloat(m.tempoEstimado) || 0;
                let tempoReal = m.tempoRealMin || tempoEst;
                let ganho = tempoEst - tempoReal;
                if (ganho > 0) creditosEconomizadosMin += ganho;

            } else if (st !== 'Cancelado') {
                pendentesTotal++;
                pendentesPorComodo[comodoKey] = (pendentesPorComodo[comodoKey] || 0) + 1;
                tempoTotalPrevistoMin += (parseFloat(m.tempoEstimado) || 0);
            }
        }
    });

    const boxPend = document.getElementById('boxPendentesPorComodo');
    const tagTotalPend = document.getElementById('totalPendentesTag');
    if (tagTotalPend) tagTotalPend.innerText = pendentesTotal;

    if (boxPend) {
        const chavesPend = Object.keys(pendentesPorComodo);
        if (chavesPend.length === 0) {
            boxPend.innerHTML = `<span class="col-span-2 text-purple-300/40 italic">Nenhuma pendente</span>`;
        } else {
            boxPend.innerHTML = chavesPend.map(c => `
                <div onclick="abrirDetalhesComodo('${c}', 'Pendente')" class="flex justify-between items-center bg-[#090614] px-2 py-1 rounded border border-purple-900/60 hover:border-amber-500/60 cursor-pointer transition" title="Ver detalhes pendentes de ${c}">
                    <span class="text-purple-300/80 font-medium"># ${c.toLowerCase()}</span>
                    <span class="font-bold text-amber-400">${pendentesPorComodo[c]}</span>
                </div>
            `).join('');
        }
    }

    const boxConc = document.getElementById('boxConcluidasPorComodo');
    const tagTotalConc = document.getElementById('totalConcluidasTag');
    if (tagTotalConc) tagTotalConc.innerText = concluidasTotal;

    if (boxConc) {
        const chavesConc = Object.keys(concluidasPorComodo);
        if (chavesConc.length === 0) {
            boxConc.innerHTML = `<span class="col-span-2 text-purple-300/40 italic">Nenhuma concluída</span>`;
        } else {
            boxConc.innerHTML = chavesConc.map(c => `
                <div onclick="abrirDetalhesComodo('${c}', 'Concluído')" class="flex justify-between items-center bg-[#090614] px-2 py-1 rounded border border-purple-900/60 hover:border-emerald-500/60 cursor-pointer transition" title="Ver detalhes de ${c}">
                    <span class="text-purple-300/80 font-medium"># ${c.toLowerCase()}</span>
                    <span class="font-bold text-emerald-400">${concluidasPorComodo[c]}</span>
                </div>
            `).join('');
        }
    }

    const elPrev = document.getElementById('statTempoPrevisto');
    if (elPrev) elPrev.innerText = `${tempoTotalPrevistoMin} min`;

    const elTerm = document.getElementById('statPrevisaoTermino');
    if (elTerm) {
        if (pendentesTotal > 0 && tempoTotalPrevistoMin > 0) {
            const agora = new Date();
            agora.setMinutes(agora.getMinutes() + tempoTotalPrevistoMin);
            const hTerm = String(agora.getHours()).padStart(2, '0');
            const mTerm = String(agora.getMinutes()).padStart(2, '0');
            elTerm.innerText = `${hTerm}:${mTerm}`;
        } else {
            elTerm.innerText = '--:--';
        }
    }

    const elCoins = document.getElementById('coinsBalance');
    if (elCoins) elCoins.innerText = `${creditosEconomizadosMin}m`;
}

function salvarDadosLocalStorage() {
    localStorage.setItem('cq_missoes', JSON.stringify(missoes));
    localStorage.setItem('cq_concluidas', contadorConcluidas.toString());
    if (estadoPonto.trabalhando && estadoPonto.inicioTurnoMs) {
        localStorage.setItem('cq_ponto_inicio', estadoPonto.inicioTurnoMs);
        localStorage.setItem('cq_ponto_trabalhando', 'true');
    } else {
        localStorage.setItem('cq_ponto_trabalhando', 'false');
    }
}

function carregarDadosLocalStorage() {
    const m = localStorage.getItem('cq_missoes');
    if (m) missoes = JSON.parse(m);

    const c = localStorage.getItem('cq_concluidas');
    if (c) contadorConcluidas = parseInt(c, 10);

    const trabalhandoLocal = localStorage.getItem('cq_ponto_trabalhando');
    const inicioTurnoLocal = localStorage.getItem('cq_ponto_inicio');

    if (trabalhandoLocal === 'true' && inicioTurnoLocal) {
        estadoPonto.trabalhando = true;
        estadoPonto.inicioTurnoMs = parseInt(inicioTurnoLocal, 10);
        const agora = Date.now();
        const diffSec = Math.floor((agora - estadoPonto.inicioTurnoMs) / 1000);
        if (diffSec > 0) estadoPonto.segundosTurnoAtual = diffSec;
    } else {
        estadoPonto.trabalhando = false;
        estadoPonto.inicioTurnoMs = null;
        estadoPonto.segundosTurnoAtual = 0;
    }
    atualizarDisplaysPonto();
}
/* ===== Gerenciamento de Frequências ===== */

const OPCOES_FREQUENCIA = [
    { valor: 1, rotulo: 'Todos os dias' },
    { valor: 2, rotulo: 'A cada 2 dias' },
    { valor: 3, rotulo: 'A cada 3 dias' },
    { valor: 4, rotulo: 'A cada 4 dias' },
    { valor: 5, rotulo: 'A cada 5 dias' },
    { valor: 7, rotulo: 'A cada 7 dias' },
    { valor: 15, rotulo: 'A cada 15 dias' }
];

function abrirModalGerenciarFrequencias() {
    const modal = document.getElementById('modalGerenciarFrequencias');
    const container = document.getElementById('listaConfigFrequencias');
    if (!modal || !container) return;

    // Agrupa por título-base, mantendo apenas a missão mais recente de cada
    const unicas = {};
    missoes.forEach(m => {
        if (!m.titulo) return;
        const base = m.titulo.replace(/\s+(I|II|III|IV|V|VI|VII|VIII|IX|X)$/i, '').trim();
        const chave = base.toLowerCase();
        if (!unicas[chave] || (m.frequenciaDias || 1) > (unicas[chave].frequenciaDias || 1)) {
            unicas[chave] = m;
        }
    });

    const lista = Object.values(unicas).sort((a, b) =>
        a.comodo.localeCompare(b.comodo) || a.titulo.localeCompare(b.titulo)
    );

    if (lista.length === 0) {
        container.innerHTML = '<p class="text-xs text-purple-300/50 text-center py-6">Nenhuma missão encontrada.</p>';
        modal.classList.remove('hidden');
        return;
    }

    const freqAtual = parseInt(document.getElementById('inputFrequencia') ? document.getElementById('inputFrequencia').value : 1, 10) || 1;

    container.innerHTML = lista.map(m => {
        const freq = parseInt(m.frequenciaDias, 10) || 1;
        // Se a frequência atual não estiver na lista de opções, inclui como opção extra
        const opcoes = OPCOES_FREQUENCIA.slice();
        if (!opcoes.some(o => o.valor === freq)) {
            opcoes.push({ valor: freq, rotulo: `A cada ${freq} dias` });
            opcoes.sort((a, b) => a.valor - b.valor);
        }
        const tituloEscapado = m.titulo.replace(/"/g, '&quot;');

        return `
            <div class="flex items-center justify-between gap-3 bg-[#090614] border border-purple-900/60 rounded-xl px-3 py-2">
                <div class="min-w-0 flex-grow">
                    <div class="text-xs font-bold text-white truncate">${m.titulo}</div>
                    <div class="text-[10px] text-purple-300/60 font-mono-code">${m.comodo || 'Sem cômodo'}</div>
                </div>
                <select data-titulo="${tituloEscapado}" class="bg-[#17112d] border border-purple-900/80 rounded-lg px-2 py-1 text-xs text-white shrink-0">
                    ${opcoes.map(o => `<option value="${o.valor}"${o.valor === freq ? ' selected' : ''}>${o.rotulo}</option>`).join('')}
                </select>
            </div>
        `;
    }).join('');

    modal.classList.remove('hidden');
}

function fecharModalGerenciarFrequencias() {
    const modal = document.getElementById('modalGerenciarFrequencias');
    if (modal) modal.classList.add('hidden');
}

async function salvarTodasFrequencias() {
    const container = document.getElementById('listaConfigFrequencias');
    if (!container) return;

    const selects = container.querySelectorAll('select[data-titulo]');
    if (selects.length === 0) {
        fecharModalGerenciarFrequencias();
        return;
    }

    const alteracoes = [];
    selects.forEach(sel => {
        const titulo = sel.getAttribute('data-titulo');
        const novaFreq = parseInt(sel.value, 10) || 1;
        const missao = missoes.find(m => m.titulo === titulo);
        const freqAntiga = missao ? (parseInt(missao.frequenciaDias, 10) || 1) : null;
        if (freqAntiga !== null && freqAntiga !== novaFreq) {
            alteracoes.push({ titulo, frequenciaDias: novaFreq });
        }
    });

    if (alteracoes.length === 0) {
        mostrarNotificacao("Sem alterações", "Nenhuma frequência foi modificada.", "info", 2000);
        fecharModalGerenciarFrequencias();
        return;
    }

    // Atualiza o estado local na hora, para a tela responder imediatamente
    alteracoes.forEach(a => {
        missoes.forEach(m => {
            if (m.titulo === a.titulo) m.frequenciaDias = a.frequenciaDias;
        });
    });
    salvarDadosLocalStorage();

    fecharModalGerenciarFrequencias();
    mostrarNotificacao("Salvando", `Atualizando ${alteracoes.length} frequência(s)...`, "sincronizando", 2000);

    try {
        const resultados = await Promise.all(alteracoes.map(a =>
            chamarAPI(API_URL, {
                method: "POST",
                body: JSON.stringify({ acao: 'editarFrequencia', titulo: a.titulo, frequenciaDias: a.frequenciaDias })
            }).then(r => r.json()).catch(() => ({ status: 'error' }))
        ));

        const falhas = resultados.filter(r => !r || r.status !== 'success').length;

        if (falhas === 0) {
            mostrarNotificacao("Sucesso", `${alteracoes.length} frequência(s) atualizada(s).`, "sucesso", 2500);
        } else {
            mostrarNotificacao("Atenção", `${falhas} de ${alteracoes.length} não foram salvas no servidor.`, "aviso", 4000);
        }
        carregarDadosDoServidor(false);
    } catch (erro) {
        console.error("Erro ao salvar frequências:", erro);
        mostrarNotificacao("Erro", "Não foi possível salvar as frequências.", "aviso", 4000);
    }
}

// =====================================================================
// CICLO DE FOLGA
// A configuracao mora na aba "Configurações" da planilha.
// A contagem vem do "Registro de Ponto": 1 dia com turno = 1 dia trabalhado.
// =====================================================================

let somFolgaLigado = false;
let audioCtxFolga = null;
let particulasRodando = false;

function atualizarPainelFolga() {
    const c = cicloFolgaAtual;
    const card = document.getElementById('cardCicloFolga');
    const banner = document.getElementById('bannerFolga');

    if (!c) {
        if (banner) banner.classList.add('hidden');
        if (card) card.classList.remove('card-folga-ativa');
        return;
    }

    const total = parseInt(c.diasParaFolga, 10) || 9;
    const feitos = parseInt(c.diasTrabalhados, 10) || 0;
    const faltam = parseInt(c.faltam, 10) || 0;
    const pct = total > 0 ? Math.min(100, Math.round((feitos / total) * 100)) : 0;

    const elFeitos = document.getElementById('folgaDiasTrabalhados');
    const elTotal = document.getElementById('folgaDeTotal');
    const elFaltam = document.getElementById('folgaFaltam');
    const elBarra = document.getElementById('folgaBarra');

    if (elFeitos) elFeitos.innerText = feitos;
    if (elTotal) elTotal.innerText = '/ ' + total + ' dias';
    if (elFaltam) elFaltam.innerText = faltam;
    if (elBarra) elBarra.style.width = pct + '%';

    const cfgDias = document.getElementById('cfgDiasTrabalhados');
    const cfgFaltam = document.getElementById('cfgFaltam');
    const cfgUltima = document.getElementById('cfgUltimaFolga');
    const inputDias = document.getElementById('inputDiasParaFolga');
    if (cfgDias) cfgDias.innerText = feitos;
    if (cfgFaltam) cfgFaltam.innerText = faltam;
    if (cfgUltima) cfgUltima.innerText = c.ultimaFolga || 'início';
    if (inputDias && document.activeElement !== inputDias) inputDias.value = total;

    if (c.ehFolgaHoje) {
        if (banner) banner.classList.remove('hidden');
        if (card) card.classList.add('card-folga-ativa');
        iniciarParticulasFolga();
        if (somFolgaLigado) tocarSomFolga();
    } else {
        if (banner) banner.classList.add('hidden');
        if (card) card.classList.remove('card-folga-ativa');
        pararParticulasFolga();
    }
}

function iniciarParticulasFolga() {
    const alvo = document.getElementById('particulasFolga');
    if (!alvo || particulasRodando) return;
    particulasRodando = true;

    const simbolos = ['🌴', '🌞', '🍃', '✨', '🌊', '☀️'];

    const criar = () => {
        if (!particulasRodando || !alvo) return;
        const p = document.createElement('span');
        p.className = 'particula-folga';
        p.innerText = simbolos[Math.floor(Math.random() * simbolos.length)];
        p.style.left = (Math.random() * 96) + '%';
        p.style.animationDuration = (3.5 + Math.random() * 2.5) + 's';
        p.style.animationDelay = (Math.random() * 1.2) + 's';
        p.style.fontSize = (11 + Math.random() * 8) + 'px';
        alvo.appendChild(p);
        setTimeout(() => { if (p.parentNode) p.parentNode.removeChild(p); }, 7000);
    };

    for (let i = 0; i < 6; i++) setTimeout(criar, i * 260);
    window._folgaInterval = setInterval(criar, 900);
}

function pararParticulasFolga() {
    particulasRodando = false;
    if (window._folgaInterval) {
        clearInterval(window._folgaInterval);
        window._folgaInterval = null;
    }
    const alvo = document.getElementById('particulasFolga');
    if (alvo) alvo.innerHTML = '';
}

// Som relaxante gerado na hora (sem arquivo). Acorde suave com fade-in/out.
function tocarSomFolga() {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        if (!audioCtxFolga) audioCtxFolga = new Ctx();
        const ctx = audioCtxFolga;
        if (ctx.state === 'suspended') ctx.resume();

        const agora = ctx.currentTime;
        const dur = 5.0;
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.0001, agora);
        master.gain.exponentialRampToValueAtTime(0.16, agora + 1.2);
        master.gain.exponentialRampToValueAtTime(0.0001, agora + dur);
        master.connect(ctx.destination);

        // Acorde maior suave (Dó maior com nona): C4, E4, G4, D5
        const notas = [261.63, 329.63, 392.00, 587.33];
        notas.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.type = i === 3 ? 'sine' : 'triangle';
            osc.frequency.setValueAtTime(freq, agora);
            // leve desafinação para soar orgânico
            osc.detune.setValueAtTime((Math.random() - 0.5) * 6, agora);
            g.gain.setValueAtTime(0.0001, agora);
            g.gain.exponentialRampToValueAtTime(0.22 / (i + 1), agora + 0.8 + i * 0.25);
            g.gain.exponentialRampToValueAtTime(0.0001, agora + dur - 0.4);
            osc.connect(g);
            g.connect(master);
            osc.start(agora);
            osc.stop(agora + dur);
        });
    } catch (e) {
        console.error('[tocarSomFolga]', e);
    }
}

function alternarSomFolga() {
    somFolgaLigado = !somFolgaLigado;
    const label = document.getElementById('labelSomFolga');
    const btn = document.getElementById('btnSomFolga');
    if (label) label.innerText = somFolgaLigado ? 'Som ligado' : 'Som';
    if (btn) {
        btn.className = somFolgaLigado
            ? 'px-3 py-1.5 rounded-xl text-xs font-mono-code bg-amber-400/30 hover:bg-amber-400/40 text-amber-100 border border-amber-400/60 transition flex items-center space-x-1.5'
            : 'px-3 py-1.5 rounded-xl text-xs font-mono-code bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40 transition flex items-center space-x-1.5';
    }
    if (somFolgaLigado) tocarSomFolga();
}

function abrirModalConfigFolga() {
    const modal = document.getElementById('modalConfigFolga');
    if (!modal) return;
    atualizarPainelFolga();
    modal.classList.remove('hidden');
}

function fecharModalConfigFolga() {
    const modal = document.getElementById('modalConfigFolga');
    if (modal) modal.classList.add('hidden');
}

async function salvarConfigFolga() {
    const input = document.getElementById('inputDiasParaFolga');
    const valor = parseInt(input ? input.value : 9, 10);
    if (!Number.isFinite(valor) || valor < 1 || valor > 365) {
        mostrarNotificacao("Atenção", "Informe um número de dias entre 1 e 365.", "aviso");
        return;
    }
    try {
        const resposta = await sincronizarComServidorEmSegundoPlano('salvarConfigFolga', { diasParaFolga: valor });
        if (resposta && resposta.cicloFolga) {
            cicloFolgaAtual = resposta.cicloFolga;
            atualizarPainelFolga();
        }
        fecharModalConfigFolga();
        mostrarNotificacao("Salvo", `Ciclo de folga: ${valor} dias trabalhados.`, "sucesso", 2500);
    } catch (e) {
        console.error('[salvarConfigFolga]', e);
        mostrarNotificacao("Erro", "Não foi possível salvar o ciclo de folga.", "aviso", 4000);
    }
}

async function resetarCicloFolga() {
    try {
        const resposta = await sincronizarComServidorEmSegundoPlano('resetarCicloFolga', {});
        if (resposta && resposta.cicloFolga) {
            cicloFolgaAtual = resposta.cicloFolga;
            atualizarPainelFolga();
        }
        mostrarNotificacao("Contagem zerada", "O ciclo recomeça hoje.", "sucesso", 2500);
    } catch (e) {
        console.error('[resetarCicloFolga]', e);
        mostrarNotificacao("Erro", "Não foi possível zerar a contagem.", "aviso", 4000);
    }
}

async function trabalharNaFolga() {
    try {
        const resposta = await sincronizarComServidorEmSegundoPlano('trabalharNaFolga', {});
        if (resposta && resposta.cicloFolga) {
            cicloFolgaAtual = resposta.cicloFolga;
            atualizarPainelFolga();
        }
        mostrarNotificacao("Bora", "A folga fica para o próximo dia.", "sucesso", 2500);
    } catch (e) {
        console.error('[trabalharNaFolga]', e);
        mostrarNotificacao("Erro", "Não foi possível pular a folga.", "aviso", 4000);
    }
}

