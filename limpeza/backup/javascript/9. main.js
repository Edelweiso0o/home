const API_URL = "https://script.google.com/macros/s/AKfycbwe_uAx1fqFEwBMQiNjS5kzmmG56iryP1E2PU9gPmjo3mt3076JHN0ygt29TsV_Dc2p/exec";

let estadoPonto = { trabalhando: false, segundosTurnoAtual: 0, totalSegundosTrabalhados: 0, intervaloTurno: null };
let missoes = [];
let turnosRegistrados = [];
let contadorConcluidas = 0;
let abaConfigAtual = 'progresso';
let esquemaCache = null;

function mostrarLoading(mostrar) {
    const loader = document.getElementById('globalLoader');
    if (loader) loader.classList.toggle('hidden', !mostrar);
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
        console.error("Erro ao carregar esquema:", e);
    }
    return null;
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
            container.innerHTML = `<p class="text-xs text-purple-400 animate-pulse">Lendo metadados da planilha...</p>`;
            const esquema = await carregarEsquemaPlanilha();
            if (!esquema) {
                container.innerHTML = `<p class="text-xs text-red-400">Falha ao carregar esquema da planilha.</p>`;
                return;
            }
            container.innerHTML = esquema.map(aba => `
                <div class="bg-[#090614] border border-purple-900/60 p-3.5 rounded-xl space-y-2">
                    <div class="flex justify-between items-center border-b border-purple-900/40 pb-1.5">
                        <span class="font-bold text-xs text-white"><i class="fa-solid fa-table text-purple-400 mr-1.5"></i> ${aba.nomeAba}</span>
                        <span class="text-[10px] font-mono-code text-purple-300/60">${aba.totalLinhas} linhas | ${aba.totalColunas} colunas</span>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
                        ${aba.colunas.map(col => `
                            <div class="text-[11px] bg-[#17112d] px-2.5 py-1.5 rounded border border-purple-900/40 flex justify-between">
                                <span class="text-purple-200">${col.posicao}. <strong>${col.cabecalho}</strong></span>
                                <span class="text-purple-400 font-mono-code text-[10px]">${col.tipoDetectado}</span>
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

function abrirModalConfig() {
    mudarAbaConfig('progresso');
    document.getElementById('modalConfig').classList.remove('hidden');
}

function fecharModalConfig() {
    document.getElementById('modalConfig').classList.add('hidden');
}

// Demais funções mantidas limpas e otimizadas...