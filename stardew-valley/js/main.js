// Lista Global de NPCs do Stardew Valley
const MORADORES_SDV = [
    "Abigail", "Alex", "Caroline", "Clint", "Demetrius", "Elliott", "Emily", "Evelyn", 
    "George", "Gus", "Haley", "Harvey", "Jas", "Jodi", "Kent", "Krobus", "Leah", 
    "Leo", "Lewis", "Linus", "Marnie", "Maru", "Pam", "Penny", "Pierre", "Robin", 
    "Sam", "Sebastian", "Shane", "Tess", "Willy", "Wizard"
];

// Lista de Culturas para a Conquista Policultura (15 unidades cada)
const CULTURAS_POLICULTURA = [
    "Chirívia", "Vagem", "Couve", "Batata", "Cauliflor", "Ruibarbo",
    "Melão", "Tomate", "Mirtilo", "Pimenta", "Rabanete", "Lombardo",
    "Milho", "Beringela", "Abóbora", "Inhame"
];

// Lista simplificada de Itens do Envio Completo
const ITENS_ENVIO_COMPLETO = [
    "Chirívia", "Vagem", "Couve", "Batata", "Cauliflor", "Ruibarbo", "Melão", "Tomate",
    "Mirtilo", "Pimenta", "Rabanete", "Lombardo", "Milho", "Beringela", "Abóbora", "Inhame",
    "Alcachofra", "Cenoura", "Açafrão", "Amora", "Cogumelo Comum", "Uva", "Avelã", "Ameixa",
    "Ovo", "Leite", "Lã", "Pena de Pato", "Pé de Coelho", "Trufa", "Queijo", "Maiorana",
    "Mel", "Cerveja", "Vinho", "Geleia", "Picles", "Tecido", "Barra de Cobre", "Barra de Ferro",
    "Barra de Ouro", "Iridium", "Bateria", "Quartzo", "Ametista", "Aquamarina", "Jade", "Esmeralda",
    "Rubi", "Diamante", "Prisma Arco-Íris"
];

// Estado da Aplicação
let historicoPresentes = JSON.parse(localStorage.getItem('sdv_historico_presentes')) || [];
let estadoPolicultura = JSON.parse(localStorage.getItem('sdv_policultura')) || {};
let estadoEnvio = JSON.parse(localStorage.getItem('sdv_envio')) || {};

window.onload = function() {
    renderizarChecklistNPCs();
    renderizarPolicultura();
    renderizarEnvioCompleto();
    atualizarProgressoCulturas();
    carregarConquistasLocais();
    filtrarHistorico();
};

function mudarAba(abaId, event) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    document.getElementById('aba-' + abaId).classList.add('active');
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('active');
    }
}

function renderizarChecklistNPCs() {
    const container = document.getElementById('checklistContainer');
    if (!container) return;

    container.innerHTML = MORADORES_SDV.map(npc => `
        <label class="checklist-item">
            <input type="checkbox" value="${npc}" class="chk-npc">
            <span>${npc}</span>
        </label>
    `).join('');
}

function toggleChecklist() {
    const wrapper = document.getElementById('checklistWrapper');
    if (wrapper) wrapper.classList.toggle('oculto');
}

function marcarTodos(status) {
    document.querySelectorAll('.chk-npc').forEach(chk => chk.checked = status);
}

function salvarLote() {
    const ano = document.getElementById('selectAno').value;
    const estacao = document.getElementById('selectEstacao').value;
    const semana = document.getElementById('selectSemana').value;
    const slot = document.getElementById('selectSlot').value;
    const item = document.getElementById('inputItemUnico').value.trim();

    const selecionados = Array.from(document.querySelectorAll('.chk-npc:checked')).map(c => c.value);

    if (!item) {
        alert("Por favor, digite o nome do item concedido!");
        return;
    }

    if (selecionados.length === 0) {
        alert("Selecione pelo menos um morador para salvar!");
        return;
    }

    const novoRegistro = {
        id: Date.now(),
        ano,
        estacao,
        semana,
        slot,
        item,
        moradores: selecionados,
        data: new Date().toLocaleDateString('pt-BR')
    };

    historicoPresentes.unshift(novoRegistro);
    localStorage.setItem('sdv_historico_presentes', JSON.stringify(historicoPresentes));

    const statusMsg = document.getElementById('statusMsg');
    if (statusMsg) {
        statusMsg.style.color = '#2d5a27';
        statusMsg.innerText = `✓ Presente salvo para ${selecionados.length} moradores!`;
        setTimeout(() => statusMsg.innerText = '', 3000);
    }

    document.getElementById('inputItemUnico').value = '';
    marcarTodos(false);
    toggleChecklist();
    filtrarHistorico();
}

function filtrarHistorico() {
    const ano = document.getElementById('filtroAno').value;
    const estacao = document.getElementById('filtroEstacao').value;
    const semana = document.getElementById('filtroSemana').value;
    const slot = document.getElementById('filtroSlot').value;
    const modo = document.getElementById('filtroModo').value;

    const container = document.getElementById('tabelaHistorico');
    if (!container) return;

    let filtrados = historicoPresentes.filter(reg => {
        if (ano !== 'Todos' && reg.ano !== ano) return false;
        if (estacao !== 'Todas' && reg.estacao !== estacao) return false;
        if (semana !== 'Todas' && reg.semana !== semana) return false;
        if (slot !== 'Todos' && reg.slot !== slot) return false;
        return true;
    });

    if (modo === 'faltam') {
        renderizarQuemNaoRecebeu(container, filtrados);
        return;
    }

    if (filtrados.length === 0) {
        container.innerHTML = `<div style="text-align:center; padding: 12px; font-size: 8px; color: #722f10;">Nenhum registro encontrado.</div>`;
        return;
    }

    container.innerHTML = filtrados.map(reg => `
        <div class="registro-item">
            <div>
                <strong>${reg.ano} • ${reg.estacao} • ${reg.semana} (${reg.slot})</strong><br>
                <span>🎁 Item: ${reg.item}</span><br>
                <span style="color:#5c2c16;">👥 Para: ${reg.moradores.join(', ')}</span>
            </div>
            <div>
                <button onclick="deletarRegistro(${reg.id})" style="background:none; border:none; color:#c53030; cursor:pointer;" title="Excluir"><i class="fa-solid fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

function alternarModoExibicao() {
    const modo = document.getElementById('filtroModo').value;
    const grupoFaltam = document.getElementById('grupoSelectFaltam');
    if (grupoFaltam) {
        grupoFaltam.style.display = modo === 'faltam' ? 'flex' : 'none';
    }

    if (modo === 'faltam') {
        popularSelectFaltam();
    }
    filtrarHistorico();
}

function popularSelectFaltam() {
    const select = document.getElementById('selectFaltamRodada');
    if (!select) return;

    const itensUnicos = [...new Set(historicoPresentes.map(h => h.item))];
    select.innerHTML = '<option value="">-- Escolha um item --</option>' + 
        itensUnicos.map(item => `<option value="${item}">${item}</option>`).join('');
}

function renderizarQuemNaoRecebeu(container, lista) {
    const itemSelecionado = document.getElementById('selectFaltamRodada').value;

    if (!itemSelecionado) {
        container.innerHTML = `<div style="text-align:center; padding: 12px; font-size: 8px; color: #722f10;">Selecione um item acima para checar quem não o recebeu.</div>`;
        return;
    }

    const receberam = new Set();
    lista.filter(r => r.item === itemSelecionado).forEach(r => r.moradores.forEach(m => receberam.add(m)));

    const faltam = MORADORES_SDV.filter(m => !receberam.has(m));

    container.innerHTML = `
        <div style="padding: 6px;">
            <div style="font-size: 8px; margin-bottom: 8px; font-weight: bold; color: #722f10;">Faltam receber "${itemSelecionado}" (${faltam.length} moradores):</div>
            <div style="font-size: 7px; line-height: 1.5; color: #333;">
                ${faltam.length > 0 ? faltam.join(', ') : '✨ Todos os moradores selecionados já receberam este item!'}
            </div>
        </div>
    `;
}

function deletarRegistro(id) {
    if (!confirm("Deseja excluir este registro do histórico?")) return;
    historicoPresentes = historicoPresentes.filter(r => r.id !== id);
    localStorage.setItem('sdv_historico_presentes', JSON.stringify(historicoPresentes));
    filtrarHistorico();
}

/* --- MONOCULTURA & POLICULTURA --- */
function renderizarPolicultura() {
    const container = document.getElementById('checklistPolicultura');
    if (!container) return;

    container.innerHTML = CULTURAS_POLICULTURA.map(item => `
        <label class="checklist-item">
            <input type="checkbox" value="${item}" ${estadoPolicultura[item] ? 'checked' : ''} onchange="salvarPolicultura(this)">
            <span>${item} (15x)</span>
        </label>
    `).join('');
}

function salvarPolicultura(chk) {
    estadoPolicultura[chk.value] = chk.checked;
    localStorage.setItem('sdv_policultura', JSON.stringify(estadoPolicultura));
    atualizarProgressoCulturas();
}

function atualizarProgressoCulturas() {
    // Monocultura
    const qtdMono = parseInt(document.getElementById('inputMonoculturaQtd').value) || 0;
    const pctMono = Math.min(100, Math.round((qtdMono / 300) * 100));
    document.getElementById('barraMonocultura').style.width = pctMono + '%';
    document.getElementById('textoMonocultura').innerText = `${qtdMono} / 300 (${pctMono}%)`;

    // Policultura
    const concluidas = Object.values(estadoPolicultura).filter(Boolean).length;
    const totalPoli = CULTURAS_POLICULTURA.length;
    const pctPoli = Math.min(100, Math.round((concluidas / totalPoli) * 100));
    document.getElementById('barraPolicultura').style.width = pctPoli + '%';
    document.getElementById('textoPolicultura').innerText = `${concluidas} / ${totalPoli} Culturas (${pctPoli}%)`;

    salvarConquistasLocais();
}

function salvarConquistasLocais() {
    const itemMono = document.getElementById('inputMonoculturaItem').value;
    const qtdMono = document.getElementById('inputMonoculturaQtd').value;
    localStorage.setItem('sdv_monocultura_item', itemMono);
    localStorage.setItem('sdv_monocultura_qtd', qtdMono);
}

function carregarConquistasLocais() {
    document.getElementById('inputMonoculturaItem').value = localStorage.getItem('sdv_monocultura_item') || '';
    document.getElementById('inputMonoculturaQtd').value = localStorage.getItem('sdv_monocultura_qtd') || 0;
    atualizarProgressoCulturas();
}

/* --- ENVIO COMPLETO --- */
function renderizarEnvioCompleto() {
    const container = document.getElementById('checklistEnvio');
    if (!container) return;

    container.innerHTML = ITENS_ENVIO_COMPLETO.map(item => `
        <label class="checklist-item">
            <input type="checkbox" value="${item}" ${estadoEnvio[item] ? 'checked' : ''} onchange="salvarEnvioItem(this)">
            <span>${item}</span>
        </label>
    `).join('');

    atualizarBarraEnvio();
}

function salvarEnvioItem(chk) {
    estadoEnvio[chk.value] = chk.checked;
    localStorage.setItem('sdv_envio', JSON.stringify(estadoEnvio));
    atualizarBarraEnvio();
}

function marcarTodosEnvio(status) {
    ITENS_ENVIO_COMPLETO.forEach(item => estadoEnvio[item] = status);
    localStorage.setItem('sdv_envio', JSON.stringify(estadoEnvio));
    renderizarEnvioCompleto();
}

function atualizarBarraEnvio() {
    const marcados = Object.values(estadoEnvio).filter(Boolean).length;
    const total = ITENS_ENVIO_COMPLETO.length;
    const pct = total > 0 ? Math.round((marcados / total) * 100) : 0;

    const barra = document.getElementById('barraEnvio');
    const texto = document.getElementById('textoEnvio');

    if (barra) barra.style.width = pct + '%';
    if (texto) texto.innerText = `${marcados} / ${total} Itens (${pct}%)`;
}