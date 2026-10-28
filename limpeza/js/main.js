// Configurações e Estado Global
let estadoPonto = {
    trabalhando: false,
    inicioTurno: null,
    segundosTurnoAtual: 0,
    totalSegundosTrabalhados: 0,
    intervaloTurno: null
};

let missoes = [];
let contadorConcluidas = 0;

// Inicialização da Aplicação
document.addEventListener('DOMContentLoaded', () => {
    iniciarRelogio();
    carregarDadosLocalStorage();
    renderizarMissoes();
    atualizarEstatisticas();
});

// Relógio em Tempo Real
function iniciarRelogio() {
    setInterval(() => {
        const agora = new Date();
        const horas = String(agora.getHours()).padStart(2, '0');
        const minutos = String(agora.getMinutes()).padStart(2, '0');
        const segundos = String(agora.getSeconds()).padStart(2, '0');
        
        const el = document.getElementById('clockRealtime');
        if (el) el.innerText = `${horas}:${minutos}:${segundos}`;

        // Atualizar tempo corrido das tarefas visíveis a cada minuto
        if (agora.getSeconds() === 0) {
            renderizarMissoes();
        }
    }, 1000);
}

// Bater Ponto / Alternar Estado
function alternarPonto() {
    estadoPonto.trabalhando = !estadoPonto.trabalhando;

    const badge = document.getElementById('badgePontoStatus');
    const textStatus = document.getElementById('textPontoStatus');
    const btnLabel = document.getElementById('btnPontoLabel');
    const warningBanner = document.getElementById('pontoWarningBanner');

    if (estadoPonto.trabalhando) {
        // Entrando em serviço
        estadoPonto.inicioTurno = new Date();
        badge.className = 'w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping';
        textStatus.innerText = 'EM SERVIÇO';
        textStatus.className = 'text-xs font-bold font-mono-code text-emerald-400';
        btnLabel.innerText = 'Encerrar Turno';
        warningBanner.classList.add('hidden');

        // Cronômetro do Turno
        estadoPonto.intervaloTurno = setInterval(() => {
            estadoPonto.segundosTurnoAtual++;
            estadoPonto.totalSegundosTrabalhados++;
            atualizarDisplaysPonto();
        }, 1000);

    } else {
        // Indo para folga
        clearInterval(estadoPonto.intervaloTurno);
        estadoPonto.segundosTurnoAtual = 0;
        
        badge.className = 'w-2.5 h-2.5 rounded-full bg-slate-500';
        textStatus.innerText = 'DE FOLGA';
        textStatus.className = 'text-xs font-bold font-mono-code text-slate-400';
        btnLabel.innerText = 'Bater Ponto';
        warningBanner.classList.remove('hidden');

        atualizarDisplaysPonto();
    }

    salvarDadosLocalStorage();
}

function atualizarDisplaysPonto() {
    // Turno Atual
    const hTurno = String(Math.floor(estadoPonto.segundosTurnoAtual / 3600)).padStart(2, '0');
    const mTurno = String(Math.floor((estadoPonto.segundosTurnoAtual % 3600) / 60)).padStart(2, '0');
    const sTurno = String(estadoPonto.segundosTurnoAtual % 60).padStart(2, '0');
    document.getElementById('timerTurnoActual').innerText = `${hTurno}:${mTurno}:${sTurno}`;

    // Total Histórico
    const totalHoras = Math.floor(estadoPonto.totalSegundosTrabalhados / 3600);
    const totalMinutos = Math.floor((estadoPonto.totalSegundosTrabalhados % 3600) / 60);
    document.getElementById('totalWorkedHours').innerText = `${totalHoras}h ${totalMinutos}m`;

    atualizarEstatisticas();
}

// Modal de Mensagens Customizadas (Substitui alert e evita violação das diretrizes)
function exibirModal(titulo, mensagem) {
    document.getElementById('modalTitle').innerText = titulo;
    document.getElementById('modalMessage').innerText = mensagem;
    document.getElementById('customModal').classList.remove('hidden');
}

function fecharModal() {
    document.getElementById('customModal').classList.add('hidden');
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

    // Limpar formulário
    document.getElementById('formNovaMissao').reset();
}

// Renderização Dinâmica com Cálculo de Tempo Corrido
function renderizarMissoes() {
    const container = document.getElementById('listaMissoesContainer');
    if (!container) return;

    if (missoes.length === 0) {
        container.innerHTML = `
            <div class="bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center space-y-2">
                <i class="fa-solid fa-check-double text-2xl text-slate-600"></i>
                <p class="text-xs text-slate-400 font-mono-code">Nenhuma missão pendente na fila.</p>
                <p class="text-[11px] text-slate-500">Cadastre novas tarefas usando o formulário ao lado.</p>
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

        // Determinar cobrança por tempo (Urgente se criada há mais de 12 horas ou prioridade Alta)
        const isUrgent = diffHoras >= 12 || m.prioridade === 'Alta';
        if (isUrgent) urgentesCount++;

        let tempoCorridoTexto = '';
        if (diffHoras > 0) {
            tempoCorridoTexto = `${diffHoras}h ${diffMinutos}m atrás`;
        } else {
            tempoCorridoTexto = `${diffMinutos} min atrás`;
        }

        return `
            <div class="bg-slate-900 border ${isUrgent ? 'card-urgent border-amber-500/50' : 'border-slate-800'} p-4 rounded-xl flex items-center justify-between hover:border-cyan-500/40 transition">
                <div class="flex items-start space-x-3.5">
                    <div class="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-cyan-400 mt-0.5 font-bold">
                        <i class="fa-solid ${getIconeComodo(m.comodo)}"></i>
                    </div>
                    <div>
                        <div class="flex items-center space-x-2">
                            <h4 class="font-bold text-sm text-white">${m.titulo}</h4>
                            ${isUrgent ? '<span class="text-[9px] bg-red-500/10 text-red-400 border border-red-500/20 px-1.5 py-0.5 rounded font-mono-code">URGENTE</span>' : ''}
                        </div>
                        <p class="text-xs text-slate-400 mt-0.5">${m.comodo} • Est: ${m.tempoEstimado} min</p>
                        
                        <div class="flex items-center space-x-2 mt-2 font-mono-code text-[10px]">
                            <span class="bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700">
                                <i class="fa-regular fa-clock mr-1"></i>Criado: ${tempoCorridoTexto}
                            </span>
                            <span class="bg-slate-800 text-cyan-300 px-2 py-0.5 rounded border border-slate-700">
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
                    <button onclick="excluirMissao(${m.id})" class="text-slate-500 hover:text-red-400 px-2 py-2 text-xs transition">
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
        missoes.splice(index, 1);
        contadorConcluidas++;
        salvarDadosLocalStorage();
        renderizarMissoes();
        atualizarEstatisticas();
    }
}

// Excluir Missão
function excluirMissao(id) {
    missoes = missoes.filter(m => m.id !== id);
    salvarDadosLocalStorage();
    renderizarMissoes();
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

// Atualização de Métricas & Relatórios
function atualizarEstatisticas() {
    document.getElementById('statsCompletedCount').innerText = contadorConcluidas;

    const horasTrabalhadas = estadoPonto.totalSegundosTrabalhados / 3600;
    const eficiencia = horasTrabalhadas > 0 ? (contadorConcluidas / horasTrabalhadas).toFixed(1) : '0.0';
    document.getElementById('statsEfficiency').innerText = `${eficiencia} missões/h`;

    // Créditos de descanso proporcional (15 min de descanso a cada 30 min trabalhados)
    const minutosDescanso = Math.floor((estadoPonto.totalSegundosTrabalhados / 60) * 0.5);
    document.getElementById('coinsBalance').innerText = `${minutosDescanso} Minutos`;

    // Ranking
    let rank = "Nível 1 - Novato";
    if (contadorConcluidas >= 20) rank = "Nível 4 - Mestre da Faxina";
    else if (contadorConcluidas >= 10) rank = "Nível 3 - Operador Pleno";
    else if (contadorConcluidas >= 5) rank = "Nível 2 - Auxiliar Dedicado";

    document.getElementById('statsRankLabel').innerText = rank;
}

// Persistência em LocalStorage
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