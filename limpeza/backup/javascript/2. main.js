// URL do Web App do Google Apps Script
const API_URL = "https://script.google.com/macros/s/AKfycbwe_uAx1fqFEwBMQiNjS5kzmmG56iryP1E2PU9gPmjo3mt3076JHN0ygt29TsV_Dc2p/exec";

// Estado Global
let estadoPonto = {
    trabalhando: false,
    inicioTurnoMs: null,
    segundosTurnoAtual: 0,
    totalSegundosTrabalhados: 0,
    intervaloTurno: null
};

let missoes = [];
let turnosRegistrados = [];
let contadorConcluidas = 0;
let abaConfigAtual = 'progresso';
let esquemaCache = null;

// Controladores de UI & Loader
function mostrarLoading(mostrar) {
    const loader = document.getElementById('globalLoader');
    if (loader) {
        if (mostrar) loader.classList.remove('hidden');
        else loader.classList.add('hidden');
    }
}

// Sistema de Notificações Toast
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
        setTimeout(() => {
            toastEl.remove();
        }, 300);
    }, duracaoMs);
}

// Relógio Principal
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

        if (agora.getSeconds() === 0) {
            renderizarMissoes();
        }
    }

    atualizar();
    setInterval(atualizar, 1000);
}

// Cálculos de Tempo e Créditos
function calcularCreditosLiquidosTurno() {
    if (!estadoPonto.trabalhando || estadoPonto.segundosTurnoAtual <= 0) return 0;

    let segundosTrabalhadosTotal = estadoPonto.segundosTurnoAtual;
    let segundosGastosEmMissoes = 0;

    missoes.forEach(m => {
        if (m.status === 'Concluído' && m.tempoEstimado) {
            segundosGastosEmMissoes += (m.tempoEstimado * 60);
        }
    });

    let saldoLiquido = segundosTrabalhadosTotal - segundosGastosEmMissoes;
    return saldoLiquido > 0 ? saldoLiquido : 0;
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
            if (diffSec > tempoEstimadoSegundos) {
                if (elAvisoAtraso) elAvisoAtraso.classList.remove('hidden');
            } else {
                if (elAvisoAtraso) elAvisoAtraso.classList.add('hidden');
            }
        }
    });

    atualizarEstatisticas();
}

// Inicialização da Aplicação
document.addEventListener('DOMContentLoaded', async () => {
    iniciarRelogio();
    await carregarDadosDoServidor();
    carregarUltimasPreferenciasSelects();
    renderizarMissoes();
});

// Comunicação HTTP / API
async function carregarDadosDoServidor(silencioso = false) {
    if (!silencioso) mostrarLoading(true);
    try {
        const response = await fetch(API_URL, { method: 'GET', redirect: 'follow' });
        const data = await response.json();
        
        if (data && data.status === "success") {
            if (data.missoes) {
                data.missoes.forEach(mServidor => {
                    let mLocal = missoes.find(x => String(x.id) === String(mServidor.id));
                    if (mLocal && mLocal.estadoMissao === 'EmAndamento' && mServidor.estadoMissao === 'EmAndamento') {
                        mServidor.tempoInicioMs = mLocal.tempoInicioMs;
                    } else if (mServidor.estadoMissao === 'EmAndamento' && mServidor.horaInicio) {
                        const partes = mServidor.horaInicio.split(':');
                        if (partes.length >= 2) {
                            const agora = new Date();
                            const dtInicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), parseInt(partes[0]), parseInt(partes[1]), partes[2] ? parseInt(partes[2]) : 0);
                            mServidor.tempoInicioMs = dtInicio.getTime();
                        }
                    }
                });
                missoes = data.missoes;
            }
            if (data.turnos) turnosRegistrados = data.turnos;
            
            const turnoAtivo = turnosRegistrados.find(t => String(t.status || '').trim() === 'Em Serviço' || String(t.status || '').trim() === 'Em andamento');
            if (turnoAtivo) {
                estadoPonto.trabalhando = true;
                
                if (turnoAtivo.entrada) {
                    const partesHora = String(turnoAtivo.entrada).split(':');
                    if (partesHora.length >= 2) {
                        const agora = new Date();
                        const dataEntrada = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), parseInt(partesHora[0]), parseInt(partesHora[1]), partesHora[2] ? parseInt(partesHora[2]) : 0);
                        estadoPonto.inicioTurnoMs = dataEntrada.getTime();
                        const diffSec = Math.floor((agora - dataEntrada) / 1000);
                        if (diffSec > 0) {
                            estadoPonto.segundosTurnoAtual = diffSec;
                        }
                    }
                }

                const badge = document.getElementById('badgePontoStatus');
                const textStatus = document.getElementById('textPontoStatus');
                const btnLabel = document.getElementById('btnPontoLabel');
                if (badge && textStatus && btnLabel) {
                    badge.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping';
                    textStatus.innerText = 'EM SERVIÇO';
                    textStatus.className = 'text-xs font-bold font-mono-code text-emerald-400';
                    btnLabel.innerText = 'Encerrar Turno';
                }
            } else {
                estadoPonto.trabalhando = false;
                estadoPonto.inicioTurnoMs = null;
                estadoPonto.segundosTurnoAtual = 0;
                
                const badge = document.getElementById('badgePontoStatus');
                const textStatus = document.getElementById('textPontoStatus');
                const btnLabel = document.getElementById('btnPontoLabel');
                if (badge && textStatus && btnLabel) {
                    badge.className = 'w-2.5 h-2.5 rounded-full bg-slate-500';
                    textStatus.innerText = 'DE FOLGA';
                    textStatus.className = 'text-xs font-bold font-mono-code text-slate-400';
                    btnLabel.innerText = 'Bater Ponto';
                }
            }

            if (data.estatisticas) {
                contadorConcluidas = data.estatisticas.concluidas || 0;
                estadoPonto.totalSegundosTrabalhados = data.estatisticas.totalSegundos || 0;
            }
        }
    } catch (error) {
        console.warn("Aviso de sincronização / Usando cache local:", error);
        carregarDadosLocalStorage();
    }
    if (!silencioso) mostrarLoading(false);
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
        const resultado = await response.json();
        return resultado;
    } catch (error) {
        console.error("Erro ao sincronizar POST:", error);
        return { status: "error", message: error.toString() };
    }
}

async function carregarEsquemaPlanilha() {
    if (esquemaCache) return esquemaCache;
    try {
        const response = await fetch(`${API_URL}?acao=esquema`, { method: 'GET', redirect: 'follow' });
        const data = await response.json();
        if (data && data.status === "success") {
            esquemaCache = data.esquema;
            return esquemaCache;
        }
    } catch (e) {
        console.error("Erro ao carregar esquema da planilha:", e);
    }
    return null;
}

// Ponto Eletrônico
async function alternarPonto() {
    const proximoStatus = !estadoPonto.trabalhando;
    
    if (proximoStatus) {
        const dataAtual = new Date();
        const horaEntradaStr = String(dataAtual.getHours()).padStart(2, '0') + ":" + String(dataAtual.getMinutes()).padStart(2, '0') + ":" + String(dataAtual.getSeconds()).padStart(2, '0');
        
        estadoPonto.trabalhando = true;
        estadoPonto.inicioTurnoMs = dataAtual.getTime();
        estadoPonto.segundosTurnoAtual = 0;
        
        const badge = document.getElementById('badgePontoStatus');
        const textStatus = document.getElementById('textPontoStatus');
        const btnLabel = document.getElementById('btnPontoLabel');
        badge.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping';
        textStatus.innerText = 'EM SERVIÇO';
        textStatus.className = 'text-xs font-bold font-mono-code text-emerald-400';
        btnLabel.innerText = 'Encerrar Turno';
        atualizarDisplaysPonto();
        mostrarNotificacao("Ponto Registrado", "Turno iniciado com sucesso!", "sucesso");

        sincronizarComServidor('baterPonto', { status: 'ENTRADA', horaExata: horaEntradaStr });
    } else {
        const dataAtual = new Date();
        const duracaoSegs = estadoPonto.segundosTurnoAtual;
        
        estadoPonto.trabalhando = false;
        estadoPonto.inicioTurnoMs = null;
        estadoPonto.segundosTurnoAtual = 0;
        
        const badge = document.getElementById('badgePontoStatus');
        const textStatus = document.getElementById('textPontoStatus');
        const btnLabel = document.getElementById('btnPontoLabel');
        badge.className = 'w-2.5 h-2.5 rounded-full bg-slate-500';
        textStatus.innerText = 'DE FOLGA';
        textStatus.className = 'text-xs font-bold font-mono-code text-slate-400';
        btnLabel.innerText = 'Bater Ponto';

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

    const totalHoras = Math.floor(estadoPonto.totalSegundosTrabalhados / 3600);
    const totalMinutos = Math.floor((estadoPonto.totalSegundosTrabalhados % 3600) / 60);
    const elTotalHours = document.getElementById('totalWorkedHours');
    if (elTotalHours) elTotalHours.innerText = `${totalHoras}h ${totalMinutos}m`;

    atualizarEstatisticas();
}

// Gerenciamento e Modal de Configurações
async function abrirModalConfig() {
    mudarAbaConfig('progresso');
    document.getElementById('modalConfig').classList.remove('hidden');
    await carregarDadosDoServidor(true);
    renderizarListasConfig();
}

function fecharModalConfig() {
    document.getElementById('modalConfig').classList.add('hidden');
}

async function mudarAbaConfig(aba) {
    abaConfigAtual = aba;
    
    ['Progresso', 'Turnos', 'Esquema'].forEach(a => {
        const btn = document.getElementById(`tabBtn${a}`);
        const content = document.getElementById(`configContent${a}`);
        const ativo = a.toLowerCase() === aba;
        if (btn) btn.className = `px-3 py-1.5 rounded-lg text-xs font-mono-code transition ${ativo ? 'bg-purple-600 text-white' : 'bg-[#090614] text-purple-300 border border-purple-900/60'}`;
        if (content) content.classList.toggle('hidden', !ativo);
    });

    const footer = document.getElementById('footerAcoesConfig');
    if (footer) footer.classList.toggle('hidden', aba === 'esquema');

    if (aba === 'esquema') {
        const container = document.getElementById('containerEsquemaPlanilha');
        if (container) {
            container.innerHTML = `<p class="text-xs text-purple-400 animate-pulse font-mono-code p-3 text-center">Lendo metadados e estrutura da planilha...</p>`;
            const esquema = await carregarEsquemaPlanilha();
            if (!esquema) {
                container.innerHTML = `<p class="text-xs text-red-400 p-3 text-center">Falha ao carregar esquema da planilha.</p>`;
                return;
            }
            container.innerHTML = esquema.map(abaSheet => `
                <div class="bg-[#090614] border border-purple-900/60 p-3.5 rounded-xl space-y-2">
                    <div class="flex justify-between items-center border-b border-purple-900/40 pb-2">
                        <span class="font-bold text-xs text-white"><i class="fa-solid fa-table text-purple-400 mr-1.5"></i> Aba: ${abaSheet.nomeAba}</span>
                        <span class="text-[10px] font-mono-code text-purple-300/60">${abaSheet.totalLinhas} linhas | ${abaSheet.totalColunas} colunas</span>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        ${abaSheet.colunas.map(col => `
                            <div class="text-[11px] bg-[#17112d] px-2.5 py-1.5 rounded border border-purple-900/40 flex justify-between items-center">
                                <span class="text-purple-200 font-medium">${col.posicao}. ${col.cabecalho}</span>
                                <span class="text-purple-400 font-mono-code text-[10px] bg-[#090614] px-1.5 py-0.5 rounded border border-purple-900/60">${col.tipoDetectado}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `).join('');
        }
    } else {
        renderizarListasConfig();
    }
}

function renderizarListasConfig() {
    const containerProgresso = document.getElementById('listaSelecaoProgresso');
    if (containerProgresso) {
        if (missoes.length === 0) {
            containerProgresso.innerHTML = `<p class="text-xs text-purple-300/50 p-3 text-center">Nenhuma missão encontrada.</p>`;
        } else {
            containerProgresso.innerHTML = missoes.map(m => `
                <label class="flex items-center justify-between bg-[#090614] p-3 rounded-xl border border-purple-900/60 hover:border-purple-500/50 cursor-pointer transition">
                    <div class="flex items-center space-x-3">
                        <input type="checkbox" name="chkProgresso" value="${m.id}" class="w-4 h-4 rounded bg-[#17112d] border-purple-800 text-purple-600">
                        <div>
                            <span class="text-xs font-bold text-white">${m.titulo}</span>
                            <p class="text-[10px] text-purple-300/60">${m.comodo} • Status: ${m.status || 'Pendente'}</p>
                        </div>
                    </div>
                    <span class="text-[10px] font-mono-code text-purple-300/40">ID: ${m.id}</span>
                </label>
            `).join('');
        }
    }

    const containerTurnos = document.getElementById('listaSelecaoTurnos');
    if (containerTurnos) {
        if (turnosRegistrados.length === 0) {
            containerTurnos.innerHTML = `<p class="text-xs text-purple-300/50 p-3 text-center">Nenhum turno registrado.</p>`;
        } else {
            containerTurnos.innerHTML = turnosRegistrados.map(t => {
                let dataClean = t.data || 'N/D';
                let entradaClean = t.entrada ? String(t.entrada).trim() : '--:--:--';
                let saidaClean = t.saida ? String(t.saida).trim() : 'Em andamento';
                if (saidaClean === '') saidaClean = 'Em andamento';

                return `
                    <label class="flex items-center justify-between bg-[#090614] p-3 rounded-xl border border-purple-900/60 hover:border-purple-500/50 cursor-pointer transition">
                        <div class="flex items-center space-x-3">
                            <input type="checkbox" name="chkTurno" value="${t.id}" class="w-4 h-4 rounded bg-[#17112d] border-purple-800 text-purple-600">
                            <div>
                                <span class="text-xs font-bold text-white">Turno ID: ${t.id} • Data: ${dataClean}</span>
                                <p class="text-[10px] text-purple-300/60">Entrada: ${entradaClean} | Saída: ${saidaClean} | Status: ${t.status || 'N/D'}</p>
                            </div>
                        </div>
                        <span class="text-[10px] font-mono-code text-purple-300/40">Duração: ${t.duracao !== "" ? t.duracao : 0} min</span>
                    </label>
                `;
            }).join('');
        }
    }
}

async function executarExclusaoSelecionadaAtiva() {
    const tipo = abaConfigAtual;
    const seletor = tipo === 'progresso' ? 'input[name="chkProgresso"]:checked' : 'input[name="chkTurno"]:checked';
    const checkboxes = document.querySelectorAll(seletor);
    
    if (checkboxes.length === 0) {
        mostrarNotificacao("Atenção", "Marque pelo menos um item.", "aviso");
        return;
    }

    const idsParaExcluir = Array.from(checkboxes).map(chk => chk.value);
    
    if (tipo === 'progresso') {
        missoes = missoes.filter(m => !idsParaExcluir.includes(String(m.id)));
        renderizarMissoes();
    } else {
        turnosRegistrados = turnosRegistrados.filter(t => !idsParaExcluir.includes(String(t.id)));
    }

    await sincronizarComServidor('excluirLote', { tipo, ids: idsParaExcluir });
    await carregarDadosDoServidor(true);
    renderizarListasConfig();
    salvarDadosLocalStorage();
    
    mostrarNotificacao("Exclusão Realizada", "Itens removidos com sucesso.", "sucesso");
}

async function executarLimpezaTudo() {
    missoes = [];
    turnosRegistrados = [];
    contadorConcluidas = 0;
    estadoPonto.totalSegundosTrabalhados = 0;
    estadoPonto.segundosTurnoAtual = 0;
    estadoPonto.inicioTurnoMs = null;

    localStorage.clear();
    atualizarDisplaysPonto();
    renderizarMissoes();

    await sincronizarComServidor('limparDados', { escopo: 'tudo' });

    fecharModalConfig();
    mostrarNotificacao("Reset Completo", "Tabelas limpas com sucesso.", "sucesso");
}

// Cadastro e Edição de Missões
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

    const novaMissao = {
        titulo: titulo,
        comodo: comodo,
        tempoEstimado: tempoEst,
        prioridade: prioridade,
        status: 'Pendente',
        estadoMissao: 'Pendente',
        tempoInicioMs: null,
        missaoUnica: missaoUnica,
        naoFazerHoje: false
    };

    const resposta = await sincronizarComServidor('adicionarMissao', novaMissao);
    if (resposta && resposta.status === 'success') {
        novaMissao.id = resposta.id;
        missoes.push(novaMissao);
        salvarDadosLocalStorage();
        renderizarMissoes();

        document.getElementById('formNovaMissao').reset();
        if (missaoUnicaEl) missaoUnicaEl.checked = false;
        carregarUltimasPreferenciasSelects();
        mostrarNotificacao("Missão Adicionada", `Tarefa #${resposta.id} cadastrada com sucesso.`, "sucesso");
    } else {
        mostrarNotificacao("Erro", "Falha ao cadastrar na planilha.", "erro");
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
    const missao = missoes.find(m => String(m.id) === String(id));
    if (!missao) return;

    if (missao.status === 'Concluído') {
        mostrarNotificacao("Bloqueado", "Você não pode editar uma missão já concluída.", "aviso");
        return;
    }

    const elId = document.getElementById('editIdMissao');
    const elTitulo = document.getElementById('editInputTitulo');
    const elComodo = document.getElementById('editSelectComodo');
    const elTempo = document.getElementById('editInputTempoEstimado');
    const elPrioridade = document.getElementById('editSelectPrioridade');
    const elUnica = document.getElementById('editInputUnica');

    if (elId) elId.value = missao.id;
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
    const missao = missoes.find(m => String(m.id) === String(id));
    if (!missao) return;

    missao.titulo = document.getElementById('editInputTitulo').value.trim();
    missao.comodo = document.getElementById('editSelectComodo').value;
    missao.tempoEstimado = parseInt(document.getElementById('editInputTempoEstimado').value, 10);
    missao.prioridade = document.getElementById('editSelectPrioridade').value;
    
    const elUnica = document.getElementById('editInputUnica');
    if (elUnica) missao.missaoUnica = elUnica.checked;

    salvarDadosLocalStorage();
    renderizarMissoes();
    fecharModalEdicao();

    await sincronizarComServidor('editarMissao', missao);
    mostrarNotificacao("Sucesso", "Missão atualizada nas abas de Progresso e Base.", "sucesso");
}

// Ações nas Missões (Imediatas no Clique)
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
        renderizarMissoes(); // Atualiza a UI imediatamente no clique
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
    renderizarMissoes(); // Atualiza a UI imediatamente no clique
    atualizarEstatisticas();
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

// Renderização da Lista de Missões
function renderizarMissoes() {
    const container = document.getElementById('listaMissoesContainer');
    if (!container) return;

    const pesoPrioridade = { 'Alta': 1, 'Média': 2, 'Baixa': 3 };
    missoes.sort((a, b) => (pesoPrioridade[a.prioridade] || 2) - (pesoPrioridade[b.prioridade] || 2));

    const missoesAtivas = missoes.filter(m => {
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
        const elUrgent = document.getElementById('countPendingUrgent');
        if (elUrgent) elUrgent.innerText = '0 Missões';
        return;
    }

    let urgentesCount = 0;

    container.innerHTML = missoesAtivas.map(m => {
        let isUrgent = m.prioridade === 'Alta' && !m.naoFazerHoje;
        if (isUrgent && (!m.estadoMissao || m.estadoMissao === 'Pendente')) urgentesCount++;

        let botoesAcao = '';
        let statusBadge = '';

        if (m.naoFazerHoje) {
            statusBadge = '<span class="text-[9px] bg-slate-500/10 text-slate-400 border border-slate-500/30 px-1.5 py-0.5 rounded font-mono-code">IGNORADA HOJE</span>';
            botoesAcao = `
                <button onclick="alternarNaoFazerHoje('${m.id}')" class="bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 px-3 py-2 rounded-xl text-xs font-mono-code transition">
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

    const elUrgent = document.getElementById('countPendingUrgent');
    if (elUrgent) elUrgent.innerText = `${urgentesCount} Missões`;
}

// Atualização de Estatísticas e Ranks
function atualizarEstatisticas() {
    const elCompleted = document.getElementById('statsCompletedCount');
    if (elCompleted) elCompleted.innerText = contadorConcluidas;

    const segundosLiquidos = calcularCreditosLiquidosTurno();
    const minCred = Math.floor(segundosLiquidos / 60);
    const segCred = segundosLiquidos % 60;
    const elCoins = document.getElementById('coinsBalance');
    if (elCoins) elCoins.innerText = mincredText(minCred, segCred);
}

function mincredText(min, seg) {
    if (min > 0) {
        return `${min}m ${seg}s`;
    }
    return `${seg}s`;
}

// Cache Local
function salvarDadosLocalStorage() {
    localStorage.setItem('cq_missoes', JSON.stringify(missoes));
    localStorage.setItem('cq_concluidas', contadorConcluidas.toString());
    localStorage.setItem('cq_total_segundos', estadoPonto.totalSegundosTrabalhados.toString());
}

function carregarDadosLocalStorage() {
    const m = localStorage.getItem('cq_missoes');
    if (m) missoes = JSON.parse(m);

    const c = localStorage.getItem('cq_concluidas');
    if (c) contadorConcluidas = parseInt(c, 10);

    const s = localStorage.getItem('cq_total_segundos');
    if (s) estadoPonto.totalSegundosTrabalhados = parseInt(s, 10);

    atualizarDisplaysPonto();
}