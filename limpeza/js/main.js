// URL do Web App do Google Apps Script
const API_URL = "https://script.google.com/macros/s/AKfycbzeMdtvGUfERmNoyguWzfCQmk3UUETn2KRrjPpEu-cdtoMWQk6y3eV9HkLFM5RvcwBX/exec";

// Estado Global
let estadoPonto = {
    trabalhando: false,
    inicioTurno: null,
    segundosTurnoAtual: 0,
    totalSegundosTrabalhados: 0,
    intervaloTurno: null
};

let missoes = [];
let turnosRegistrados = [];
let contadorConcluidas = 0;
let abaConfigAtual = 'missoes';

// Controle de Loading Global (Apenas Spinner)
function mostrarLoading(mostrar) {
    const loader = document.getElementById('globalLoader');
    if (loader) {
        if (mostrar) loader.classList.remove('hidden');
        else loader.classList.add('hidden');
    }
}

// Sincronismo no Modal de Config (Apenas Spinner)
function mostrarModalSync(mostrar) {
    const syncLoader = document.getElementById('modalSyncLoader');
    if (syncLoader) {
        if (mostrar) syncLoader.classList.remove('hidden');
        else syncLoader.classList.add('hidden');
    }
}

// Inicialização do Relógio Realtime
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

        if (agora.getSeconds() === 0) {
            renderizarMissoes();
        }
    }

    atualizar();
    setInterval(atualizar, 1000);
}

// Executa ao carregar o DOM
document.addEventListener('DOMContentLoaded', async () => {
    iniciarRelogio();
    await carregarDadosDoServidor();
    renderizarMissoes();
});

// Comunicação com o Google Sheets (API Web)
async function carregarDadosDoServidor(silencioso = false) {
    if (!silencioso) mostrarLoading(true);
    mostrarModalSync(true);
    try {
        const response = await fetch(API_URL);
        const data = await response.json();
        
        if (data && data.missoes) {
            missoes = data.missoes;
        } else {
            carregarDadosLocalStorage();
        }

        if (data && data.turnos) {
            turnosRegistrados = data.turnos;
        }
        
        if (data && data.estatisticas) {
            contadorConcluidas = data.estatisticas.concluidas || 0;
            estadoPonto.totalSegundosTrabalhados = data.estatisticas.totalSegundos || 0;
        }
    } catch (error) {
        console.warn("Modo offline / Erro ao carregar da planilha. Usando localStorage:", error);
        carregarDadosLocalStorage();
    }
    if (!silencioso) mostrarLoading(false);
    mostrarModalSync(false);
    atualizarDisplaysPonto();
    
    // Atualiza o modal se estiver aberto
    if (!document.getElementById('modalConfig').classList.contains('hidden')) {
        renderizarListasConfig();
    }
}

async function sincronizarComServidor(acao, payload) {
    mostrarLoading(true);
    mostrarModalSync(true);
    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ acao, ...payload })
        });
        const resultado = await response.json();
        mostrarLoading(false);
        mostrarModalSync(false);
        return resultado;
    } catch (error) {
        console.error("Erro ao sincronizar com a planilha:", error);
        mostrarLoading(false);
        mostrarModalSync(false);
    }
}

// Bater Ponto / Alternar Estado
function alternarPonto() {
    estadoPonto.trabalhando = !estadoPonto.trabalhando;

    const badge = document.getElementById('badgePontoStatus');
    const textStatus = document.getElementById('textPontoStatus');
    const btnLabel = document.getElementById('btnPontoLabel');

    if (estadoPonto.trabalhando) {
        estadoPonto.inicioTurno = new Date();
        badge.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping';
        textStatus.innerText = 'EM SERVIÇO';
        textStatus.className = 'text-xs font-bold font-mono-code text-emerald-400';
        btnLabel.innerText = 'Encerrar Turno';

        estadoPonto.intervaloTurno = setInterval(() => {
            estadoPonto.segundosTurnoAtual++;
            estadoPonto.totalSegundosTrabalhados++;
            atualizarDisplaysPonto();
        }, 1000);

        sincronizarComServidor('baterPonto', { status: 'ENTRADA', timestamp: new Date().toISOString() });
    } else {
        clearInterval(estadoPonto.intervaloTurno);
        
        sincronizarComServidor('baterPonto', { 
            status: 'SAIDA', 
            duracaoSegundos: estadoPonto.segundosTurnoAtual,
            timestamp: new Date().toISOString() 
        });

        estadoPonto.segundosTurnoAtual = 0;
        
        badge.className = 'w-2.5 h-2.5 rounded-full bg-slate-500';
        textStatus.innerText = 'DE FOLGA';
        textStatus.className = 'text-xs font-bold font-mono-code text-slate-400';
        btnLabel.innerText = 'Bater Ponto';

        atualizarDisplaysPonto();
    }

    salvarDadosLocalStorage();
}

function atualizarDisplaysPonto() {
    const hTurno = String(Math.floor(estadoPonto.segundosTurnoAtual / 3600)).padStart(2, '0');
    const mTurno = String(Math.floor((estadoPonto.segundosTurnoAtual % 3600) / 60)).padStart(2, '0');
    const sTurno = String(estadoPonto.segundosTurnoAtual % 60).padStart(2, '0');
    document.getElementById('timerTurnoActual').innerText = `${hTurno}:${mTurno}:${sTurno}`;

    const totalHoras = Math.floor(estadoPonto.totalSegundosTrabalhados / 3600);
    const totalMinutos = Math.floor((estadoPonto.totalSegundosTrabalhados % 3600) / 60);
    document.getElementById('totalWorkedHours').innerText = `${totalHoras}h ${totalMinutos}m`;

    atualizarEstatisticas();
}

// Modal de Mensagens Customizadas (Z-Index Superior)
function exibirModal(titulo, mensagem) {
    document.getElementById('modalTitle').innerText = titulo;
    document.getElementById('modalMessage').innerText = mensagem;
    document.getElementById('customModal').classList.remove('hidden');
}

function fecharModal() {
    document.getElementById('customModal').classList.add('hidden');
}

// Modal de Configurações e Limpeza Seletiva
async function abrirModalConfig() {
    renderizarListasConfig();
    document.getElementById('modalConfig').classList.remove('hidden');
    await carregarDadosDoServidor(true);
    renderizarListasConfig();
}

function fecharModalConfig() {
    document.getElementById('modalConfig').classList.add('hidden');
}

async function mudarAbaConfig(aba) {
    abaConfigAtual = aba;
    const btnMissoes = document.getElementById('tabBtnMissoes');
    const btnTurnos = document.getElementById('tabBtnTurnos');
    const contentMissoes = document.getElementById('configContentMissoes');
    const contentTurnos = document.getElementById('configContentTurnos');

    if (aba === 'missoes') {
        btnMissoes.className = "px-3 py-1.5 rounded-lg text-xs font-mono-code bg-purple-600 text-white transition";
        btnTurnos.className = "px-3 py-1.5 rounded-lg text-xs font-mono-code bg-[#090614] text-purple-300 border border-purple-900/60 transition";
        contentMissoes.classList.remove('hidden');
        contentTurnos.classList.add('hidden');
    } else {
        btnTurnos.className = "px-3 py-1.5 rounded-lg text-xs font-mono-code bg-purple-600 text-white transition";
        btnMissoes.className = "px-3 py-1.5 rounded-lg text-xs font-mono-code bg-[#090614] text-purple-300 border border-purple-900/60 transition";
        contentTurnos.classList.remove('hidden');
        contentMissoes.classList.add('hidden');
    }

    renderizarListasConfig();
    await carregarDadosDoServidor(true);
    renderizarListasConfig();
}

function renderizarListasConfig() {
    // 1. Lista de Missões
    const containerMissoes = document.getElementById('listaSelecaoMissoes');
    if (missoes.length === 0) {
        containerMissoes.innerHTML = `<p class="text-xs text-purple-300/50 p-3 text-center">Nenhuma missão encontrada na base.</p>`;
    } else {
        containerMissoes.innerHTML = missoes.map(m => `
            <label class="flex items-center justify-between bg-[#090614] p-3 rounded-xl border border-purple-900/60 hover:border-purple-500/50 cursor-pointer transition">
                <div class="flex items-center space-x-3">
                    <input type="checkbox" name="chkMissao" value="${m.id}" class="w-4 h-4 rounded bg-[#17112d] border-purple-800 text-purple-600 focus:ring-purple-500">
                    <div>
                        <span class="text-xs font-bold text-white">${m.titulo}</span>
                        <p class="text-[10px] text-purple-300/60">${m.comodo} • Prioridade: ${m.prioridade} • Status: ${m.status || 'Pendente'}</p>
                    </div>
                </div>
                <span class="text-[10px] font-mono-code text-purple-300/40">ID: ${m.id}</span>
            </label>
        `).join('');
    }

    // 2. Lista de Turnos
    const containerTurnos = document.getElementById('listaSelecaoTurnos');
    if (turnosRegistrados.length === 0) {
        containerTurnos.innerHTML = `<p class="text-xs text-purple-300/50 p-3 text-center">Nenhum turno registrado na base.</p>`;
    } else {
        containerTurnos.innerHTML = turnosRegistrados.map(t => {
            let dataClean = t.data || 'N/D';
            if (dataClean.includes('T')) dataClean = dataClean.substring(0, 10).split('-').reverse().join('/');
            
            let entradaClean = t.entrada ? String(t.entrada).trim() : '--:--:--';
            if (entradaClean.includes('T')) entradaClean = entradaClean.substring(11, 19);

            let saidaClean = t.saida ? String(t.saida).trim() : 'Em andamento';
            if (saidaClean.includes('T')) saidaClean = saidaClean.substring(11, 19);
            if (saidaClean === '') saidaClean = 'Em andamento';

            return `
                <label class="flex items-center justify-between bg-[#090614] p-3 rounded-xl border border-purple-900/60 hover:border-purple-500/50 cursor-pointer transition">
                    <div class="flex items-center space-x-3">
                        <input type="checkbox" name="chkTurno" value="${t.id}" class="w-4 h-4 rounded bg-[#17112d] border-purple-800 text-purple-600 focus:ring-purple-500">
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

async function executarExclusaoSelecionadaAtiva() {
    const tipo = abaConfigAtual;
    const seletor = tipo === 'missoes' ? 'input[name="chkMissao"]:checked' : 'input[name="chkTurno"]:checked';
    const checkboxes = document.querySelectorAll(seletor);
    
    if (checkboxes.length === 0) {
        exibirModal("Nenhum item selecionado", "Marque pelo menos um item na lista para poder excluir.");
        return;
    }

    const idsParaExcluir = Array.from(checkboxes).map(chk => chk.value);
    const confirmacao = confirm(`Tem certeza que deseja excluir os ${idsParaExcluir.length} itens selecionados?`);
    if (!confirmacao) return;

    if (tipo === 'missoes') {
        missoes = missoes.filter(m => !idsParaExcluir.includes(String(m.id)));
        renderizarMissoes();
    } else {
        turnosRegistrados = turnosRegistrados.filter(t => !idsParaExcluir.includes(String(t.id)));
    }

    await sincronizarComServidor('excluirLote', { tipo, ids: idsParaExcluir });

    await carregarDadosDoServidor(true);
    renderizarListasConfig();
    salvarDadosLocalStorage();
    
    exibirModal("Exclusão Realizada", "Os itens selecionados foram removidos com sucesso da base e da planilha.");
}

async function executarLimpezaTudo() {
    const confirmacao = confirm("⚠️ ATENÇÃO: Deseja apagar TUDO da planilha e do navegador (Missões e Turnos)?");
    if (!confirmacao) return;

    missoes = [];
    turnosRegistrados = [];
    contadorConcluidas = 0;
    estadoPonto.totalSegundosTrabalhados = 0;
    estadoPonto.segundosTurnoAtual = 0;

    localStorage.clear();
    atualizarDisplaysPonto();
    renderizarMissoes();

    await sincronizarComServidor('limparDados', { escopo: 'tudo' });

    fecharModalConfig();
    exibirModal("Reset Completo", "Todas as tabelas foram limpas com sucesso.");
}

// Cadastro de Novas Missões
function cadastrarMissao(event) {
    event.preventDefault();

    const titulo = document.getElementById('inputTitulo').value.trim();
    const comodo = document.getElementById('selectComodo').value;
    const tempoEst = parseInt(document.getElementById('inputTempoEstimado').value, 10);
    const prioridade = document.getElementById('selectPrioridade').value;

    if (!titulo) return;

    const novaMissao = {
        id: Date.now(),
        titulo: titulo,
        comodo: comodo,
        tempoEstimado: tempoEst,
        prioridade: prioridade,
        criadoEm: new Date().toISOString(),
        concluida: false
    };

    missoes.push(novaMissao);
    salvarDadosLocalStorage();
    renderizarMissoes();

    sincronizarComServidor('adicionarMissao', novaMissao);
    document.getElementById('formNovaMissao').reset();
}

// Renderização Dinâmica das Missões
function renderizarMissoes() {
    const container = document.getElementById('listaMissoesContainer');
    if (!container) return;

    if (missoes.length === 0) {
        container.innerHTML = `
            <div class="bg-[#17112d] border border-purple-900/50 p-8 rounded-2xl text-center space-y-2">
                <i class="fa-solid fa-check-double text-2xl text-purple-400/50"></i>
                <p class="text-xs text-purple-200/70 font-mono-code">Nenhuma missão pendente na fila.</p>
                <p class="text-[11px] text-purple-300/40">Cadastre novas tarefas usando o formulário ao lado.</p>
            </div>
        `;
        document.getElementById('countPendingUrgent').innerText = '0 Missões';
        return;
    }

    const agora = new Date();
    let urgentesCount = 0;

    container.innerHTML = missoes.map(m => {
        const dataCriacao = new Date(m.criadoEm);
        const diffMs = agora - dataCriacao;
        const diffHoras = Math.floor(diffMs / (1000 * 60 * 60));
        const diffMinutos = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

        const isUrgent = diffHoras >= 12 || m.prioridade === 'Alta';
        if (isUrgent) urgentesCount++;

        let tempoCorridoTexto = '';
        if (diffHoras > 0) {
            tempoCorridoTexto = `${diffHoras}h ${diffMinutos}m atrás`;
        } else {
            tempoCorridoTexto = `${diffMinutos} min atrás`;
        }

        return `
            <div class="bg-[#17112d] border ${isUrgent ? 'card-urgent border-amber-500/50' : 'border-purple-900/50'} p-4 rounded-xl flex items-center justify-between hover:border-purple-500/50 transition">
                <div class="flex items-start space-x-3.5">
                    <div class="w-10 h-10 rounded-xl bg-[#231a42] border border-purple-800/60 flex items-center justify-center text-purple-400 mt-0.5 font-bold">
                        <i class="fa-solid ${getIconeComodo(m.comodo)}"></i>
                    </div>
                    <div>
                        <div class="flex items-center space-x-2">
                            <h4 class="font-bold text-sm text-white">${m.titulo}</h4>
                            ${isUrgent ? '<span class="text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded font-mono-code">URGENTE</span>' : ''}
                        </div>
                        <p class="text-xs text-purple-300/70 mt-0.5">${m.comodo} • Est: ${m.tempoEstimado} min</p>
                        
                        <div class="flex items-center space-x-2 mt-2 font-mono-code text-[10px]">
                            <span class="bg-[#090614] text-purple-300 px-2 py-0.5 rounded border border-purple-900/60">
                                <i class="fa-regular fa-clock mr-1"></i>Criado: ${tempoCorridoTexto}
                            </span>
                            <span class="bg-[#090614] text-purple-300 px-2 py-0.5 rounded border border-purple-900/60">
                                Prioridade: ${m.prioridade}
                            </span>
                        </div>
                    </div>
                </div>

                <div class="flex items-center space-x-2">
                    <button onclick="concluirMissao(${m.id})" class="bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-3 py-2 rounded-xl text-xs font-mono-code transition flex items-center space-x-1.5">
                        <i class="fa-solid fa-check"></i>
                        <span>Concluir</span>
                    </button>
                    <button onclick="excluirMissao(${m.id})" class="text-purple-300/40 hover:text-red-400 px-2 py-2 text-xs transition">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    }).join('');

    document.getElementById('countPendingUrgent').innerText = `${urgentesCount} Missões`;
}

// Concluir Missão
function concluirMissao(id) {
    if (!estadoPonto.trabalhando) {
        exibirModal("Atenção: Você está DE FOLGA!", "Bata o ponto no menu superior para registrar seu tempo de trabalho antes de concluir missões.");
        return;
    }

    const index = missoes.findIndex(m => m.id === id);
    if (index !== -1) {
        const missaoConcluida = missoes.splice(index, 1)[0];
        contadorConcluidas++;
        salvarDadosLocalStorage();
        renderizarMissoes();
        atualizarEstatisticas();

        sincronizarComServidor('concluirMissao', { id: missaoConcluida.id, titulo: missaoConcluida.titulo });
    }
}

// Excluir Missão
function excluirMissao(id) {
    missoes = missoes.filter(m => m.id !== id);
    salvarDadosLocalStorage();
    renderizarMissoes();

    sincronizarComServidor('excluirMissao', { id });
}

// Ordenação por Urgência (Mais Antigas Primeiro)
function ordenarPorUrgencia() {
    missoes.sort((a, b) => new Date(a.criadoEm) - new Date(b.criadoEm));
    renderizarMissoes();
}

// Auxiliares de Ícones
function getIconeComodo(comodo) {
    switch (comodo) {
        case 'Cozinha': return 'fa-utensils';
        case 'Banheiro': return 'fa-sink';
        case 'Quarto': return 'fa-bed';
        case 'Sala': return 'fa-tv';
        case 'Quintal/Garagem': return 'fa-tree';
        default: return 'fa-broom';
    }
}

// Atualização de Métricas
function atualizarEstatisticas() {
    document.getElementById('statsCompletedCount').innerText = contadorConcluidas;

    const horasTrabalhadas = estadoPonto.totalSegundosTrabalhados / 3600;
    const eficiencia = horasTrabalhadas > 0 ? (contadorConcluidas / horasTrabalhadas).toFixed(1) : '0.0';
    document.getElementById('statsEfficiency').innerText = `${eficiencia} missões/h`;

    const minutosDescanso = Math.floor((estadoPonto.totalSegundosTrabalhados / 60) * 0.5);
    document.getElementById('coinsBalance').innerText = `${minutosDescanso} Minutos`;

    let rank = "Nível 1 - Novato";
    if (contadorConcluidas >= 20) rank = "Nível 4 - Mestre da Faxina";
    else if (contadorConcluidas >= 10) rank = "Nível 3 - Operador Pleno";
    else if (contadorConcluidas >= 5) rank = "Nível 2 - Auxiliar Dedicado";

    document.getElementById('statsRankLabel').innerText = rank;
}

// LocalStorage (Fallback / Cache Local)
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