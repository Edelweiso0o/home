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
    carregarDadosLocalStorage();
    renderizarVisaoAtual();
    iniciarRelogio();

    await carregarDadosDoServidor(true);
    carregarUltimasPreferenciasSelects();
    renderizarVisaoAtual();
});

async function carregarDadosDoServidor(forcarVerificacao = true) {
    const inicioMs = performance.now();
    mostrarLoader(true);

    try {
        let urlFinal = API_URL + '?verificarLancamento=' + (forcarVerificacao ? 'sim' : 'sim');
        const response = await fetch(urlFinal, { method: 'GET', redirect: 'follow' });
        const data = await response.json();
        
        const fimMs = performance.now();
        const latenciaMs = fimMs - inicioMs;

        if (data && data.status === "success") {
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
                // Procura o último turno registrado para exibir caso esteja de folga
                const ultimoTurno = data.turnos[data.turnos.length - 1];
                if (ultimoTurno && ultimoTurno["Tempo Trabalhado"]) {
                    estadoPonto.ultimoTempoTrabalhadoFormatado = ultimoTurno["Tempo Trabalhado"];
                }
            }

            if (data.missoes && data.missoes.length > 0) {
                data.missoes.forEach(mServidor => {
                    let mLocal = missoes.find(x => String(x.id) === String(mServidor.id) && String(x.data || '') === String(mServidor.data || ''));
                    if (mLocal && (mLocal.estadoMissao === 'EmAndamento' || mLocal.status === 'Em Andamento')) {
                        mServidor.estadoMissao = 'EmAndamento';
                        mServidor.status = 'Em Andamento';
                        mServidor.tempoInicioMs = mLocal.tempoInicioMs;
                        if (mLocal.horaInicioStr) mServidor.horaInicioStr = mLocal.horaInicioStr;
                    }
                    if (mLocal && mLocal.status === 'Cancelado') {
                        mServidor.status = 'Cancelado';
                        mServidor.estadoMissao = 'Cancelado';
                    }
                });
                missoes = data.missoes;
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

async function sincronizarComServidor(acao, payload) {
    const inicioMs = performance.now();
    mostrarLoader(true);

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ acao, ...payload })
        });
        const resJson = await response.json();
        mostrarLoader(false, performance.now() - inicioMs);
        return resJson;
    } catch (error) {
        console.error("Erro background sync:", error);
        mostrarLoader(false, performance.now() - inicioMs);
        return { status: "error" };
    }
}

async function alternarPonto() {
    // Validação: Não permitir encerrar o ponto se houver alguma missão "Em Andamento"
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

        sincronizarComServidor('baterPonto', { status: 'ENTRADA', horaExata: horaEntradaStr });
    } else {
        const duracaoSegs = estadoPonto.segundosTurnoAtual;
        
        estadoPonto.trabalhando = false;
        estadoPonto.inicioTurnoMs = null;
        estadoPonto.segundosTurnoAtual = 0;
        
        localStorage.removeItem('cq_ponto_inicio');
        localStorage.setItem('cq_ponto_trabalhando', 'false');

        atualizarDisplaysPonto();
        mostrarNotificacao("Turno Encerrado", "Você entrou em folga.", "atencao", 2000);

        sincronizarComServidor('baterPonto', { status: 'SAIDA', duracaoSegundos: duracaoSegs });
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
        // Quando estiver de folga, exibe o último tempo trabalhado no turno
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
    mostrarNotificacao("Sucesso", "Missão adicionada à aba Missões e à fila de progresso.", "sucesso", 2000);

    const resposta = await sincronizarComServidor('adicionarMissao', novaMissao);
    if (resposta && resposta.status === 'success' && resposta.id) {
        novaMissao.id = resposta.id;
        salvarDadosLocalStorage();
        renderizarVisaoAtual();
    }
}

function abrirModalDuplicarRapido() {
    const modal = document.getElementById('modalDuplicarRapido');
    const container = document.getElementById('listaOpcoesDuplicar');
    if (!modal || !container) return;

    const unicasBase = {};
    missoes.forEach(m => {
        let tituloBaseClean = m.titulo.replace(/\s+(I|II|III|IV|V|VI|VII|VIII|IX|X)$/i, '').trim();
        if (!unicasBase[tituloBaseClean]) {
            unicasBase[tituloBaseClean] = m;
        }
    });

    const lista = Object.values(unicasBase);
    if (lista.length === 0) {
        container.innerHTML = `<p class="text-xs text-purple-300/50 p-3 text-center">Nenhuma missão disponível para repetir.</p>`;
    } else {
        container.innerHTML = lista.map(m => `
            <div onclick="duplicarMissaoPorTitulo('${m.titulo}')" class="bg-[#090614] border border-purple-900/60 p-3 rounded-xl hover:border-purple-500 cursor-pointer transition flex justify-between items-center">
                <div>
                    <h4 class="font-bold text-xs text-white">${m.titulo}</h4>
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

async function duplicarMissaoPorTitulo(tituloOriginal) {
    fecharModalDuplicarRapido();
    const missaoRef = missoes.find(m => m.titulo.startsWith(tituloOriginal));
    if (!missaoRef) return;

    const hojeStr = obterDataHojeStr();
    const tituloBase = missaoRef.titulo.replace(/\s+(I|II|III|IV|V|VI|VII|VIII|IX|X)$/i, '').trim();
    const duplicatasExistentes = missoes.filter(m => m.data === hojeStr && m.titulo.startsWith(tituloBase));
    
    const romanos = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
    const proximoSufixo = romanos[duplicatasExistentes.length] || (duplicatasExistentes.length + 1);
    const tituloNovo = `${tituloBase} ${proximoSufixo}`;

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

    const resposta = await sincronizarComServidor('adicionarMissao', novaMissaoDuplicada);
    if (resposta && resposta.status === 'success' && resposta.id) {
        novaMissaoDuplicada.id = resposta.id;
        salvarDadosLocalStorage();
        renderizarVisaoAtual();
    }
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

    sincronizarComServidor('editarMissao', {
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

        sincronizarComServidor('atualizarEstadoMissao', { id: missao.id, estadoMissao: 'EmAndamento', horaExata: horaInicioExata });
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

    if (missao.tempoInicioMs) {
        const diffMin = Math.round((dataAtual.getTime() - missao.tempoInicioMs) / 60000);
        missao.tempoRealMin = diffMin > 0 ? diffMin : 1;
    } else {
        missao.tempoRealMin = missao.tempoEstimado;
    }

    missao.status = 'Concluído';
    missao.estadoMissao = 'Concluído';
    contadorConcluidas++;

    salvarDadosLocalStorage();
    renderizarVisaoAtual();
    
    mostrarNotificacao("Missão Concluída!", "Tarefa finalizada com sucesso.", "sucesso", 2500);

    sincronizarComServidor('concluirMissao', { 
        id: missao.id, 
        horaExata: horaTerminoExata,
        tempoRealMin: missao.tempoRealMin 
    });
}

function alternarNaoFazerHoje(id) {
    const missao = encontrarMissaoHoje(id);
    if (missao) {
        missao.status = 'Cancelado';
        missao.estadoMissao = 'Cancelado';
        
        salvarDadosLocalStorage();
        renderizarVisaoAtual();
        mostrarNotificacao("Cancelado", "Missão cancelada para hoje.", "atencao", 2000);

        sincronizarComServidor('atualizarEstadoMissao', { id: missao.id, estadoMissao: 'Cancelado' });
    }
}

function excluirMissao(id) {
    const hojeStr = obterDataHojeStr();
    missoes = missoes.filter(m => !(String(m.id) === String(id) && String(m.data || hojeStr) === hojeStr));
    salvarDadosLocalStorage();
    renderizarVisaoAtual();
    mostrarNotificacao("Excluído", "Missão removida.", "atencao", 2000);
    sincronizarComServidor('excluirMissao', { id });
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
        if (m.status === 'Concluído' || m.status === 'Cancelado') return false;
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
        if (fStatus !== 'TODOS' && (m.status || 'Pendente') !== fStatus) return false;
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
        let corStatus = 'text-purple-300 bg-purple-500/10 border-purple-500/30';
        if (m.status === 'Concluído') corStatus = 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
        if (m.status === 'Cancelado') corStatus = 'text-red-400 bg-red-500/10 border-red-500/30';

        return `
            <div class="bg-[#17112d] border border-purple-900/50 p-3.5 rounded-xl flex items-center justify-between">
                <div class="flex items-center space-x-3">
                    <div class="w-8 h-8 rounded-lg bg-[#231a42] border border-purple-800/60 flex items-center justify-center text-purple-400 font-bold text-xs">
                        <i class="fa-solid ${getIconeComodo(m.comodo)}"></i>
                    </div>
                    <div>
                        <div class="flex items-center space-x-2">
                            <h4 class="font-bold text-xs text-white">${m.titulo}</h4>
                            <span class="text-[9px] ${corStatus} border px-1.5 py-0.5 rounded font-mono-code">${m.status || 'Pendente'}</span>
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
        if (statusFiltro === 'Concluído') {
            return m.status === 'Concluído';
        } else {
            return m.status !== 'Concluído' && m.status !== 'Cancelado';
        }
    });

    if (missoesDoComodo.length === 0) {
        conteudo.innerHTML = `<p class="text-xs text-purple-300/50 p-4 text-center">Nenhuma missão ${statusTexto.toLowerCase()} neste cômodo hoje.</p>`;
    } else {
        conteudo.innerHTML = missoesDoComodo.map(m => {
            const badgeBg = statusFiltro === 'Concluído' ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/20 text-amber-400 border-amber-500/30';
            return `
                <div class="bg-[#090614] border border-purple-900/60 p-3 rounded-xl space-y-1">
                    <div class="flex justify-between items-center">
                        <span class="text-xs font-bold text-white">${m.titulo}</span>
                        <span class="text-[10px] font-mono-code ${badgeBg} px-2 py-0.5 rounded border">${m.status || 'Pendente'}</span>
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

            if (m.status === 'Concluído') {
                concluidasTotal++;
                concluidasPorComodo[comodoKey] = (concluidasPorComodo[comodoKey] || 0) + 1;

                let tempoEst = parseFloat(m.tempoEstimado) || 0;
                let tempoReal = m.tempoRealMin || tempoEst;
                let ganho = tempoEst - tempoReal;
                if (ganho > 0) creditosEconomizadosMin += ganho;

            } else if (m.status !== 'Cancelado') {
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