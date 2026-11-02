// URL do Web App do Google Apps Script
const API_URL = "https://script.google.com/macros/s/AKfycbwe_uAx1fqFEwBMQiNjS5kzmmG56iryP1E2PU9gPmjo3mt3076JHN0ygt29TsV_Dc2p/exec";

// Estado Global
let estadoPonto = {
    trabalhando: false,
    inicioTurnoMs: null,
    segundosTurnoAtual: 0,
    totalSegundosTrabalhados: 0
};

let missoes = [];
let turnosRegistrados = [];
let contadorConcluidas = 0;
let abaConfigAtual = 'progresso';
let esquemaCache = null;

function mostrarLoading(mostrar) {
    const loader = document.getElementById('globalLoader');
    if (loader) {
        if (mostrar) loader.classList.remove('hidden');
        else loader.classList.add('hidden');
    }
}

function mostrarNotificacao(titulo, mensagem, tipo = 'info', duracaoMs = 4000) {
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
    } else if (tipo === 'erro') {
        corBorda = 'border-red-500/50';
        corIcone = 'text-red-400';
        iconeFa = 'fa-circle-xmark';
        corBarra = 'bg-red-500';
    }

    const toastEl = document.createElement('div');
    toastEl.id = toastId;
    toastEl.className = `toast-gta pointer-events-auto bg-[#17112d]/95 backdrop-blur-md border ${corBorda} rounded-xl p-3.5 shadow-2xl w-80 flex flex-col space-y-2 relative overflow-hidden`;
    
    toastEl.innerHTML = `
        <div class="flex items-start space-x-3">
            <div class="${corIcone} text-base mt-0.5"><i class="fa-solid ${iconeFa}"></i></div>
            <div class="flex-grow">
                <h5 class="text-xs font-bold text-white">${titulo}</h5>
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
}

// Relógio Principal e Atualização Contínua em Tempo Real
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

    // Atualiza dinamicamente os cronômetros das missões em andamento sem reload
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

// Inicialização da Aplicação com Recuperação Local Imediata
document.addEventListener('DOMContentLoaded', async () => {
    carregarDadosLocalStorage(); // Carrega primeiro do localStorage para evitar qualquer delay ou zera-zera
    renderizarMissoes();
    iniciarRelogio();

    await carregarDadosDoServidor(); // Sincroniza em background
    carregarUltimasPreferenciasSelects();
    renderizarMissoes();
});

async function carregarDadosDoServidor(silencioso = true) {
    if (!silencioso) mostrarLoading(true);
    try {
        const hoje = new Date();
        const dataChaveStr = String(hoje.getFullYear()) + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0');
        const nomeChaveLocalStorage = 'cq_lancado_' + dataChaveStr;
        const jaLancadoHoje = localStorage.getItem(nomeChaveLocalStorage) === 'true';

        let urlFinal = API_URL + '?verificarLancamento=' + (jaLancadoHoje ? 'nao' : 'sim');
        const response = await fetch(urlFinal, { method: 'GET', redirect: 'follow' });
        const data = await response.json();
        
        if (data && data.status === "success") {
            localStorage.setItem(nomeChaveLocalStorage, 'true');

            if (data.missoes && data.missoes.length > 0) {
                // Mescla mantendo os estados locais em andamento para não perder o timer
                data.missoes.forEach(mServidor => {
                    let mLocal = missoes.find(x => String(x.id) === String(mServidor.id));
                    if (mLocal && mLocal.estadoMissao === 'EmAndamento') {
                        mServidor.estadoMissao = mLocal.estadoMissao;
                        mServidor.tempoInicioMs = mLocal.tempoInicioMs;
                    }
                });
                missoes = data.missoes;
            }
            if (data.turnos) turnosRegistrados = data.turnos;
            
            // Verifica turno ativo na planilha se não houver local
            const turnoAtivoServidor = turnosRegistrados.find(t => String(t.status || '').trim() === 'Em Serviço');
            if (turnoAtivoServidor && !estadoPonto.trabalhando) {
                estadoPonto.trabandando = true;
                if (turnoAtivoServidor.entrada) {
                    const partesHora = String(turnoAtivoServidor.entrada).split(':');
                    if (partesHora.length >= 2) {
                        const agora = new Date();
                        const dtEntrada = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), parseInt(partesHora[0]), parseInt(partesHora[1]), partesHora[2] ? parseInt(partesHora[2]) : 0);
                        estadoPonto.inicioTurnoMs = dtEntrada.getTime();
                        estadoPonto.trabalhando = true;
                        localStorage.setItem('cq_ponto_inicio', estadoPonto.inicioTurnoMs);
                        localStorage.setItem('cq_ponto_trabalhando', 'true');
                    }
                }
            }

            if (data.estatisticas) {
                contadorConcluidas = data.estatisticas.concluidas || 0;
            }
        }
    } catch (error) {
        console.warn("Aviso de sincronização / Usando cache local:", error);
    }
    if (!silencioso) mostrarLoading(false);
    salvarDadosLocalStorage();
    atualizarDisplaysPonto();
    renderizarMissoes();
}

async function sincronizarComServidor(acao, payload) {
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            redirect: "follow",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ acao, ...payload })
        });
        return await response.json();
    } catch (error) {
        console.error("Erro ao sincronizar POST:", error);
        return { status: "error", message: error.toString() };
    }
}

// Ponto Eletrônico com Persistência Local blindada contra zera-zera
async function alternarPonto() {
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
        mostrarNotificacao("Ponto Registrado", "Turno iniciado com sucesso!", "sucesso");

        sincronizarComServidor('baterPonto', { status: 'ENTRADA', horaExata: horaEntradaStr });
    } else {
        const duracaoSegs = estadoPonto.segundosTurnoAtual;
        
        estadoPonto.trabalhando = false;
        estadoPonto.inicioTurnoMs = null;
        estadoPonto.segundosTurnoAtual = 0;
        
        localStorage.removeItem('cq_ponto_inicio');
        localStorage.setItem('cq_ponto_trabalhando', 'false');

        atualizarDisplaysPonto();
        mostrarNotificacao("Turno Encerrado", "Você entrou em folga.", "atencao");

        sincronizarComServidor('baterPonto', { status: 'SAIDA', duracaoSegundos: duracaoSegs });
    }
    salvarDadosLocalStorage();
}

function atualizarDisplaysPonto() {
    const hTurno = String(Math.floor(estadoPonto.segundosTurnoAtual / 3600)).padStart(2, '0');
    const mTurno = String(Math.floor((estadoPonto.segundosTurnoAtual % 3600) / 60)).padStart(2, '0');
    const sTurno = String(estadoPonto.segundosTurnoAtual % 60).padStart(2, '0');
    const elTimerTurno = document.getElementById('timerTurnoActual');
    if (elTimerTurno) elTimerTurno.innerText = `${hTurno}:${mTurno}:${sTurno}`;

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
            badge.className = 'w-2.5 h-2.5 rounded-full bg-slate-500';
            textStatus.innerText = 'DE FOLGA';
            textStatus.className = 'text-xs font-bold font-mono-code text-slate-400';
            btnLabel.innerText = 'Bater Ponto';
        }
    }

    atualizarEstatisticasGerais();
}

// Ações nas Missões com Atualização Imediata (Sem Reload)
function iniciarMissao(id) {
    if (!estadoPonto.trabalhando) {
        mostrarNotificacao("Atenção", "Você está de folga! Bata o ponto para iniciar.", "aviso");
        return;
    }

    const missao = missoes.find(m => String(m.id) === String(id));
    if (missao) {
        const dataAtual = new Date();
        const horaInicioExata = String(dataAtual.getHours()).padStart(2, '0') + ":" + String(dataAtual.getMinutes()).padStart(2, '0') + ":" + String(dataAtual.getSeconds()).padStart(2, '0');

        missao.estadoMissao = 'EmAndamento';
        missao.tempoInicioMs = dataAtual.getTime();
        
        salvarDadosLocalStorage();
        renderizarMissoes(); // Atualiza a tela instantaneamente no clique
        mostrarNotificacao("Missão Iniciada", `Cronômetro rodando para: ${missao.titulo}`, "sucesso");

        sincronizarComServidor('atualizarEstadoMissao', { id: missao.id, estadoMissao: 'EmAndamento', horaExata: horaInicioExata });
    }
}

function concluirMissao(id) {
    if (!estadoPonto.trabalhando) {
        mostrarNotificacao("Atenção", "Você está de folga!", "aviso");
        return;
    }

    const missao = missoes.find(m => String(m.id) === String(id));
    if (!missao) return;

    const dataAtual = new Date();
    const horaTerminoExata = String(dataAtual.getHours()).padStart(2, '0') + ":" + String(dataAtual.getMinutes()).padStart(2, '0') + ":" + String(dataAtual.getSeconds()).padStart(2, '0');

    missao.status = 'Concluído';
    missao.estadoMissao = 'Concluído';
    contadorConcluidas++;

    salvarDadosLocalStorage();
    renderizarMissoes(); // Atualiza a tela instantaneamente no clique
    atualizarEstatisticasGerais();
    mostrarNotificacao("Missão Concluída!", "Tarefa finalizada e créditos calculados.", "sucesso");

    sincronizarComServidor('concluirMissao', { id: missao.id, horaExata: horaTerminoExata });
}

function alternarNaoFazerHoje(id) {
    const missao = missoes.find(m => String(m.id) === String(id));
    if (missao) {
        missao.naoFazerHoje = !missao.naoFazerHoje;
        salvarDadosLocalStorage();
        renderizarMissoes();
        mostrarNotificacao("Atualizado", missao.naoFazerHoje ? "Missão ignorada hoje." : "Missão reativada.", "atencao");
    }
}

async function excluirMissao(id) {
    missoes = missoes.filter(m => String(m.id) !== String(id));
    salvarDadosLocalStorage();
    renderizarMissoes();
    await sincronizarComServidor('excluirMissao', { id });
    mostrarNotificacao("Excluído", "Missão removida com sucesso.", "aviso");
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

// Renderização e Cálculo dos Novos Cards de Estatísticas / RPG
function renderizarMissoes() {
    const container = document.getElementById('listaMissoesContainer');
    if (!container) return;

    const pesoPrioridade = { 'Alta': 1, 'Média': 2, 'Baixa': 3 };
    missoes.sort((a, b) => (pesoPrioridade[a.prioridade] || 2) - (pesoPrioridade[b.prioridade] || 2));

    const hojeStr = (() => {
        const d = new Date();
        return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
    })();

    const missoesAtivas = missoes.filter(m => {
        if (m.data && m.data !== hojeStr) return false;
        if (m.missaoUnica && m.status === 'Concluído') return false;
        if (m.status === 'Concluído') return false; 
        return true;
    });

    if (missoesAtivas.length === 0) {
        container.innerHTML = `
            <div class="bg-[#17112d] border border-purple-900/50 p-8 rounded-2xl text-center space-y-2">
                <i class="fa-solid fa-check-double text-2xl text-purple-400/50"></i>
                <p class="text-xs text-purple-200/70 font-mono-code">Nenhuma missão pendente na fila para hoje.</p>
                <p class="text-[11px] text-purple-300/40">Parabéns! Todas as tarefas diárias foram cumpridas.</p>
            </div>
        `;
        atualizarEstatisticasGerais();
        return;
    }

    container.innerHTML = missoesAtivas.map(m => {
        let isUrgent = m.prioridade === 'Alta' && !m.naoFazerHoje;
        let botoesAcao = '';
        let statusBadge = '';

        if (m.naoFazerHoje) {
            statusBadge = '<span class="text-[9px] bg-slate-500/10 text-slate-400 border border-slate-500/30 px-1.5 py-0.5 rounded font-mono-code">IGNORADA HOJE</span>';
            botoesAcao = `
                <button onclick="alternarNaoFazerHoje('${m.id}')" class="bg-purple-600/25 hover:bg-purple-600/40 text-purple-300 px-3 py-2 rounded-xl text-xs font-mono-code transition">
                    Fazer Hoje
                </button>
            `;
        } else if (!m.estadoMissao || m.estadoMissao === 'Pendente') {
            statusBadge = '<span class="text-[9px] bg-purple-500/10 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded font-mono-code">PENDENTE</span>';
            botoesAcao = `
                <button onclick="abrirModalEdicao('${m.id}')" class="text-purple-300/50 hover:text-purple-300 px-2 py-2 text-xs transition" title="Editar">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button onclick="alternarNaoFazerHoje('${m.id}')" class="text-slate-400 hover:text-white px-2 py-2 text-xs transition" title="Não fazer hoje">
                    <i class="fa-solid fa-ban"></i>
                </button>
                <button onclick="iniciarMissao('${m.id}')" class="bg-purple-600 hover:bg-purple-500 text-white px-3 py-2 rounded-xl text-xs font-mono-code transition flex items-center space-x-1.5 shadow-md">
                    <i class="fa-solid fa-play"></i>
                    <span>Iniciar</span>
                </button>
            `;
        } else if (m.estadoMissao === 'EmAndamento') {
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
            <div class="bg-[#17112d] border ${isUrgent && (!m.estadoMissao || m.estadoMissao === 'Pendente') ? 'card-urgent border-amber-500/50' : 'border-purple-900/50'} p-4 rounded-xl flex items-center justify-between hover:border-purple-500/50 transition ${m.naoFazerHoje ? 'opacity-50' : ''}">
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
                        <p class="text-xs text-purple-300/70 mt-0.5">${m.comodo} • Est: ${m.tempoEstimado} min • ID: ${m.id}</p>
                        
                        <div class="flex items-center space-x-2 mt-2 font-mono-code text-[10px]">
                            <span class="bg-[#090614] text-purple-300 px-2 py-0.5 rounded border border-purple-900/60">
                                Prioridade: ${m.prioridade}
                            </span>
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

    atualizarEstatisticasGerais();
}

// Atualização de Estatísticas e Cards Superiores
function atualizarEstatisticasGerais() {
    const hojeStr = (() => {
        const d = new Date();
        return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear();
    })();

    let pendentesHoje = 0;
    let concluidasHoje = 0;
    let tempoTotalPrevistoMin = 0;

    missoes.forEach(m => {
        if (m.data === hojeStr) {
            if (m.status === 'Concluído') {
                concluidasHoje++;
            } else {
                if (!m.naoFazerHoje) {
                    pendentesHoje++;
                    tempoTotalPrevistoMin += (parseFloat(m.tempoEstimado) || 0);
                }
            }
        }
    });

    // 1. Atualiza Contador de Pendentes
    const elPend = document.getElementById('countPendingUrgent');
    if (elPend) elPend.innerText = `${pendentesHoje} Pendentes`;

    // 2. Atualiza Concluídas Hoje
    const elConc = document.getElementById('statConcluidasHoje');
    if (elConc) elConc.innerText = `${concluidasHoje} Concluídas`;

    // 3. Tempo Previsto Total
    const elPrev = document.getElementById('statTempoPrevisto');
    if (elPrev) elPrev.innerText = `${tempoTotalPrevistoMin} min`;

    // 4. Previsão de Término
    const elTerm = document.getElementById('statPrevisaoTermino');
    if (elTerm) {
        if (pendentesHoje > 0 && tempoTotalPrevistoMin > 0) {
            const agora = new Date();
            agora.setMinutes(agora.getMinutes() + tempoTotalPrevistoMin);
            const hTerm = String(agora.getHours()).padStart(2, '0');
            const mTerm = String(agora.getMinutes()).padStart(2, '0');
            elTerm.innerText = `${hTerm}:${mTerm}`;
        } else {
            elTerm.innerText = '--:--';
        }
    }

    // 5. Tempo Ganho (Créditos)
    let segundosTrabalhadosTotal = estadoPonto.segundosTurnoAtual;
    let segundosGastosEmMissoes = 0;
    missoes.forEach(m => {
        if (m.status === 'Concluído' && m.tempoEstimado && m.data === hojeStr) {
            segundosGastosEmMissoes += (m.tempoEstimado * 60);
        }
    });
    let saldoLiquido = segundosTrabalhadosTotal - segundosGastosEmMissoes;
    saldoLiquido = saldoLiquido > 0 ? saldoLiquido : 0;

    const minCred = Math.floor(saldoLiquido / 60);
    const segCred = saldoLiquido % 60;
    const elCoins = document.getElementById('coinsBalance');
    if (elCoins) elCoins.innerText = mincredText(minCred, segCred);
}

function mincredText(min, seg) {
    if (min > 0) return `${min}m ${seg}s`;
    return `${seg}s`;
}

// Persistência Local Avançada (Salva o relógio do turno e missões para nunca zerar)
function salvarDadosLocalStorage() {
    localStorage.setItem('cq_missoes', JSON.stringify(missoes));
    localStorage.setItem('cq_concluidas', contadorConcluidas.toString());
    if (estadoPonto.trabalhando && estadoPonto.inicioTurnoMs) {
        localStorage.setItem('cq_ponto_inicio', estadoPonto.inicioTurnoMs);
        localStorage.setItem('cq_ponto_trabalhando', 'true');
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
        if (diffSec > 0) {
            estadoPonto.segundosTurnoAtual = diffSec;
        }
    }
    atualizarDisplaysPonto();
}