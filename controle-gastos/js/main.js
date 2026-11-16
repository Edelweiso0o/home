const URL_API = "https://script.google.com/macros/s/AKfycby0eJ37QgNg3g6e9NjYo6TgTGMndmVWkpEtAwf4KVEzrzGY4WsjeyB7pRfdUVo-ulqd/exec";

let dadosGlobaisExtrato = [];
let dadosGlobaisItensCartao = [];
let temporizadorIntervalId = null;

window.onload = function() {
    exibirVersaoData();
    document.getElementById('filtroFaturaMes').value = obterMesSeguintePadrao();
    carregarDados();
};

function exibirVersaoData() {
    const elemento = document.getElementById('labelVersaoData');
    if (elemento) {
        elemento.innerText = "v2.2.4 • 28/10/2026 18:10";
    }
}

function iniciarTemporizadorTempoReal() {
    const inicio = performance.now();
    const el = document.getElementById('labelTemporizador');
    if (temporizadorIntervalId) clearInterval(temporizadorIntervalId);
    temporizadorIntervalId = setInterval(() => {
        if (el) {
            const decorrido = (performance.now() - inicio) / 1000;
            el.innerText = `${decorrido.toFixed(1)}s`;
        }
    }, 100);
    return inicio;
}

function pararTemporizadorTempoReal(inicio) {
    if (temporizadorIntervalId) {
        clearInterval(temporizadorIntervalId);
        temporizadorIntervalId = null;
    }
    const el = document.getElementById('labelTemporizador');
    if (el) {
        const totalSeg = (performance.now() - inicio) / 1000;
        el.innerText = `${totalSeg.toFixed(1)}s`;
    }
}

function obterMesSeguintePadrao() {
    const agora = new Date();
    let mesSeguinte = agora.getMonth() + 2; 
    if (mesSeguinte > 12) mesSeguinte = 1;
    return String(mesSeguinte).padStart(2, '0');
}

function atualizarDatalistsDinamicos() {
    const datalistItens = document.getElementById('listaSugestoesItens');
    if (datalistItens) {
        datalistItens.innerHTML = '';
        const itensUnicos = [...new Set(dadosGlobaisItensCartao.map(i => i.descricao).filter(Boolean))];
        itensUnicos.sort();
        itensUnicos.forEach(desc => {
            const opt = document.createElement('option');
            opt.value = desc;
            datalistItens.appendChild(opt);
        });
    }

    const cardItens = dadosGlobaisExtrato.filter(item => item.tipo === 'CartaoDeCredito');

    const datalistEstab = document.getElementById('listaSugestoesEstabelecimentos');
    if (datalistEstab) {
        datalistEstab.innerHTML = '';
        const estabUnicos = [...new Set(cardItens.map(i => i.descricao).filter(Boolean))];
        estabUnicos.sort();
        estabUnicos.forEach(desc => {
            const opt = document.createElement('option');
            opt.value = desc;
            datalistEstab.appendChild(opt);
        });
    }

    const datalistCat = document.getElementById('listaSugestoesCategorias');
    if (datalistCat) {
        datalistCat.innerHTML = '';
        const catUnicas = [...new Set(cardItens.map(i => i.categoria).filter(Boolean))];
        catUnicas.sort();
        catUnicas.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            datalistCat.appendChild(opt);
        });
    }
}

function mascaraValorBanco(input) {
    let apenasNumeros = input.value.replace(/\D/g, '');
    if (!apenasNumeros) {
        input.value = '';
        return;
    }
    if (apenasNumeros.length > 6) {
        apenasNumeros = apenasNumeros.slice(0, 6);
    }
    let valorNumerico = Number(apenasNumeros) / 100;
    input.value = formatarMoeda(valorNumerico);
}

function converterMoedaParaNumero(valorStr) {
    if (!valorStr) return 0;
    if (typeof valorStr === 'number') return valorStr;
    let limpo = valorStr.replace('R$', '').trim().replace(/\./g, '').replace(',', '.');
    return parseFloat(limpo) || 0;
}

function obterDataLocalISO() {
    const agora = new Date();
    const offsetMs = agora.getTimezoneOffset() * 60 * 1000;
    const localDate = new Date(agora.getTime() - offsetMs);
    return localDate.toISOString().split('T')[0];
}

function mudarAba(aba) {
    document.getElementById('conteudoCartaoDeCredito').classList.add('hidden');
    document.getElementById('conteudoDespesas').classList.add('hidden');
    document.getElementById('conteudoRendas').classList.add('hidden');
    document.getElementById('conteudoCorrecaoManual').classList.add('hidden');

    document.getElementById('tabelaContainerCartao').classList.add('hidden');
    document.getElementById('tabelaContainerDespesas').classList.add('hidden');
    document.getElementById('tabelaContainerRendas').classList.add('hidden');
    document.getElementById('tabelaContainerCorrecaoManual').classList.add('hidden');

    document.getElementById('tabBtnCartaoDeCredito').className = "flex-1 py-3 px-4 text-sm font-semibold text-center border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition flex items-center justify-center space-x-2";
    document.getElementById('tabBtnDespesas').className = "flex-1 py-3 px-4 text-sm font-semibold text-center border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition flex items-center justify-center space-x-2";
    document.getElementById('tabBtnRendas').className = "flex-1 py-3 px-4 text-sm font-semibold text-center border-b-2 border-transparent text-slate-500 hover:text-slate-700 transition flex items-center justify-center space-x-2";
    document.getElementById('tabBtnCorrecaoManual').className = "flex-1 py-3 px-4 text-sm font-semibold text-center border-b-2 border-transparent text-amber-600 hover:text-amber-700 transition flex items-center justify-center space-x-2 bg-amber-50/30";

    if (aba === 'CorrecaoManual') {
        document.getElementById('conteudoCorrecaoManual').classList.remove('hidden');
        document.getElementById('tabelaContainerCorrecaoManual').classList.remove('hidden');
        document.getElementById('tabBtnCorrecaoManual').className = "flex-1 py-3 px-4 text-sm font-semibold text-center border-b-2 border-amber-600 text-amber-600 transition flex items-center justify-center space-x-2 bg-amber-50/50";
        popularSelectsCorrecaoManual();
    } else {
        const idConteudo = aba === 'CartaoDeCredito' ? 'conteudoCartaoDeCredito' : 'conteudo' + aba;
        const idTabela = aba === 'CartaoDeCredito' ? 'tabelaContainerCartao' : 'tabelaContainer' + aba;
        document.getElementById(idConteudo).classList.remove('hidden');
        document.getElementById(idTabela).classList.remove('hidden');
        document.getElementById('tabBtn' + aba).className = "flex-1 py-3 px-4 text-sm font-semibold text-center border-b-2 border-indigo-600 text-indigo-600 transition flex items-center justify-center space-x-2";
    }

    carregarDados();
}

function carregarDados() {
    const inicio = iniciarTemporizadorTempoReal();
    fetch(URL_API + "?action=ler")
        .then(res => res.json())
        .then(resposta => {
            pararTemporizadorTempoReal(inicio);

            if (resposta && resposta.transacoes) {
                dadosGlobaisExtrato = resposta.transacoes;
                dadosGlobaisItensCartao = resposta.itensCartao || [];
            } else if (Array.isArray(resposta)) {
                dadosGlobaisExtrato = resposta;
                dadosGlobaisItensCartao = [];
            }

            atualizarDatalistsDinamicos();
            atualizarCardsResumo();
            filtrarCartao();
            renderizarDespesas();
            renderizarRendas();
            popularSelectsCorrecaoManual();
        })
        .catch(err => {
            pararTemporizadorTempoReal(inicio);
            console.error("Erro ao carregar dados:", err);
        });
}

function popularSelectsCorrecaoManual() {
    const selectIdAntigo = document.getElementById('selectIdAntigoManual');
    const selectComp = document.getElementById('selectCompraDestinoManual');

    if (!selectIdAntigo || !selectComp) return;

    const valorAtualCompra = selectComp.value;

    selectIdAntigo.innerHTML = '';
    selectComp.innerHTML = '';

    const idsItensUnicos = [...new Set(dadosGlobaisItensCartao.map(sub => sub.idCompra))];
    idsItensUnicos.sort((a, b) => a - b);

    idsItensUnicos.forEach(idVal => {
        const opt = document.createElement('option');
        opt.value = idVal;
        opt.text = `ID de Sub-Item: ${idVal}`;
        selectIdAntigo.appendChild(opt);
    });

    const comprasCartao = dadosGlobaisExtrato.filter(item => item.tipo === 'CartaoDeCredito');
    const idsUnicosCompras = [];
    comprasCartao.forEach(item => {
        if (!idsUnicosCompras.some(c => c.idCompra === item.idCompra)) {
            idsUnicosCompras.push(item);
        }
    });

    idsUnicosCompras.sort((a, b) => parseInt(a.idCompra, 10) - parseInt(b.idCompra, 10));

    idsUnicosCompras.forEach(compra => {
        const opt = document.createElement('option');
        opt.value = compra.idCompra;
        opt.text = `ID: ${compra.idCompra} - ${compra.descricao} (${compra.data} | ${formatarMoeda(compra.valor)})`;
        selectComp.appendChild(opt);
    });

    if (valorAtualCompra) {
        selectComp.value = valorAtualCompra;
    }

    filtrarTabelaSubItensManual();
}

function filtrarTabelaSubItensManual() {
    const filtroId = document.getElementById('filtroIdExatoManual').value.trim();
    const filtroDesc = document.getElementById('filtroDescSubManual').value.toLowerCase().trim();
    const tbodyManual = document.getElementById('tabelaListaSubItensManual');
    if (!tbodyManual) return;

    tbodyManual.innerHTML = '';

    const subItensFiltrados = dadosGlobaisItensCartao.filter(sub => {
        if (filtroId !== '') {
            if (parseInt(sub.idCompra, 10) !== parseInt(filtroId, 10)) return false;
        }
        if (filtroDesc !== '') {
            if (!sub.descricao || !sub.descricao.toLowerCase().includes(filtroDesc)) return false;
        }
        return true;
    });

    if (subItensFiltrados.length === 0) {
        tbodyManual.innerHTML = `<tr><td colspan="6" class="py-4 text-center text-slate-400 text-xs">Nenhum sub-item encontrado com esses filtros.</td></tr>`;
        return;
    }

    subItensFiltrados.forEach(sub => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50";
        tr.innerHTML = `
            <td class="py-2 px-3 font-mono font-bold text-amber-600">${sub.idCompra}</td>
            <td class="py-2 px-3 text-xs uppercase">${sub.tipoSub}</td>
            <td class="py-2 px-3 font-medium text-slate-800">${sub.descricao}</td>
            <td class="py-2 px-3 text-right font-bold">${formatarMoeda(sub.valor)}</td>
            <td class="py-2 px-3 text-center">
                <div class="flex items-center justify-center space-x-1">
                    <input type="number" id="novoIdInd_${sub.rowItem}" value="${sub.idCompra}" class="w-16 bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded px-2 py-1 text-center outline-none focus:border-amber-500 font-mono">
                    <button onclick="salvarIdIndividual(${sub.rowItem})" class="bg-indigo-600 hover:bg-indigo-500 text-white px-2 py-1 rounded text-xs transition" title="Salvar novo ID"><i class="fa-solid fa-check"></i></button>
                </div>
            </td>
            <td class="py-2 px-3 text-center">
                <button onclick="deletarSubItemManual(${sub.rowItem})" class="text-rose-500 hover:text-rose-700 p-1" title="Excluir sub-item"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbodyManual.appendChild(tr);
    });
}

function salvarIdIndividual(rowItem) {
    const inputNovoId = document.getElementById(`novoIdInd_${rowItem}`);
    if (!inputNovoId) return;
    const novoId = parseInt(inputNovoId.value, 10);

    if (isNaN(novoId) || novoId <= 0) {
        alert("Digite um ID válido.");
        return;
    }

    const params = new URLSearchParams({
        action: 'atualizarIdSubItemIndividual',
        rowItem: rowItem,
        novoId: novoId
    }).toString();

    const inicio = iniciarTemporizadorTempoReal();
    fetch(URL_API + "?" + params)
        .then(res => res.json())
        .then(resposta => {
            pararTemporizadorTempoReal(inicio);
            carregarDados();
        })
        .catch(err => {
            pararTemporizadorTempoReal(inicio);
            alert("Erro ao alterar ID individual do sub-item.");
        });
}

function salvarVinculoManualLote() {
    const novoIdCompra = document.getElementById('selectCompraDestinoManual').value;
    const idAntigo = document.getElementById('selectIdAntigoManual').value;

    if (!novoIdCompra || !idAntigo) {
        alert("Selecione a compra correta e o ID do sub-item.");
        return;
    }

    const params = new URLSearchParams({
        action: 'vincularManualLote',
        idAntigo: idAntigo,
        novoIdCompra: novoIdCompra
    }).toString();

    const inicio = iniciarTemporizadorTempoReal();
    fetch(URL_API + "?" + params)
        .then(res => res.json())
        .then(resposta => {
            pararTemporizadorTempoReal(inicio);
            carregarDados();
        })
        .catch(err => {
            pararTemporizadorTempoReal(inicio);
            alert("Erro ao migrar sub-itens em lote.");
        });
}

function deletarSubItemManual(rowItem) {
    if (!confirm("Tem certeza que deseja excluir este sub-item da planilha?")) return;

    const params = new URLSearchParams({
        action: 'deletarSubItem',
        rowItem: rowItem
    }).toString();

    const inicio = iniciarTemporizadorTempoReal();
    fetch(URL_API + "?" + params)
        .then(res => res.json())
        .then(resposta => {
            pararTemporizadorTempoReal(inicio);
            carregarDados();
        })
        .catch(err => {
            pararTemporizadorTempoReal(inicio);
            alert("Erro ao excluir sub-item.");
        });
}

function atualizarCardsResumo() {
    let totalRendas = 0;
    let totalDespesas = 0;
    let totalCartao = 0;

    const mesFaturaFiltroGlobal = document.getElementById('filtroFaturaMes').value;

    dadosGlobaisExtrato.forEach(item => {
        if (item.tipo === 'Rendas') totalRendas += item.valor;
        if (item.tipo === 'Despesas') totalDespesas += item.valor;
        if (item.tipo === 'CartaoDeCredito') {
            if (mesFaturaFiltroGlobal === 'todos' || item.faturaMes === mesFaturaFiltroGlobal) {
                totalCartao += item.valor;
            }
        }
    });

    let dinheiroConta = totalRendas - totalDespesas;

    document.getElementById('cardTotalRendas').innerText = formatarMoeda(totalRendas);
    document.getElementById('cardTotalDespesas').innerText = formatarMoeda(totalDespesas);
    document.getElementById('cardTotalCartao').innerText = formatarMoeda(totalCartao);
    document.getElementById('cardDinheiroConta').innerText = formatarMoeda(dinheiroConta);
}

function filtrarCartao() {
    const mesFatura = document.getElementById('filtroFaturaMes').value;
    const mesCompra = document.getElementById('filtroMesCartao').value;
    const textoBusca = document.getElementById('filtroBuscaTextoCartao').value.toLowerCase().trim();

    const totalGeralCartao = dadosGlobaisExtrato.filter(item => item.tipo === 'CartaoDeCredito').length;

    const filtrados = dadosGlobaisExtrato.filter(item => {
        if (item.tipo !== 'CartaoDeCredito') return false;
        if (mesFatura !== 'todos' && item.faturaMes !== mesFatura) return false;
        if (mesCompra !== 'todos') {
            let mesItemData = item.data ? item.data.split('/')[1] : "";
            if (mesItemData !== mesCompra) return false;
        }
        if (textoBusca && !item.descricao.toLowerCase().includes(textoBusca)) return false;
        return true;
    });

    const lblContador = document.getElementById('contadorCartao');
    lblContador.innerText = (mesFatura !== 'todos' || mesCompra !== 'todos' || textoBusca !== '') 
        ? `Exibindo ${filtrados.length} de ${totalGeralCartao} itens` 
        : `${filtrados.length} itens`;

    atualizarCardsResumo();
    renderizarCartao(filtrados);
}

function renderizarCartao(lista) {
    const tbody = document.getElementById('tabelaCartaoCorpo');
    tbody.innerHTML = '';

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" class="py-6 text-center text-slate-400">Nenhum registro encontrado.</td></tr>`;
        return;
    }

    lista.forEach(item => {
        const itensDestaCompra = dadosGlobaisItensCartao.filter(sub => parseInt(sub.idCompra) === parseInt(item.idCompra));
        
        let botaoItens = `<span class="text-slate-400 text-xs">Nenhum</span>`;
        if (itensDestaCompra.length > 0) {
            botaoItens = `<button onclick='toggleVisualizarItens("${item.idCompra}")' class="bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-2.5 py-1 rounded-lg text-xs font-semibold transition flex items-center space-x-1 mx-auto">
                <i class="fa-solid fa-list-check"></i> <span>(${itensDestaCompra.length}) Ver</span>
            </button>`;
        }

        let htmlItensOcultos = '';
        if (itensDestaCompra.length > 0) {
            htmlItensOcultos = `<div id="subitens-${item.idCompra}" class="hidden mt-2 pl-4 border-l-2 border-indigo-200 space-y-1 text-xs text-slate-500 bg-slate-50 p-2 rounded-r-lg">
                <span class="font-semibold text-slate-600 block mb-1">Sub-itens da Compra:</span>
                ${itensDestaCompra.map(sub => {
                    let sinal = sub.tipoSub === 'credito' ? '-' : '+';
                    let corTexto = sub.tipoSub === 'credito' ? 'text-emerald-600' : 'text-slate-700';
                    return `<div>• ${sub.descricao} - <strong class="${corTexto}">${sinal}${formatarMoeda(sub.valor)}</strong></div>`;
                }).join('')}
            </div>`;
        }

        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50/50 transition border-b border-slate-50";
        tr.innerHTML = `
            <td class="py-3 px-4 font-mono font-bold text-indigo-600 text-xs">${item.idCompra}</td>
            <td class="py-3 px-4 text-slate-600">${item.data}</td>
            <td class="py-3 px-4 font-medium text-slate-700">${item.faturaMes || '-'}</td>
            <td class="py-3 px-4">
                <div class="font-medium text-slate-800">${item.descricao}</div>
                ${htmlItensOcultos}
            </td>
            <td class="py-3 px-4 text-slate-600">${item.categoria || '-'}</td>
            <td class="py-3 px-4 text-slate-600">${item.parcela || '1/1'}</td>
            <td class="py-3 px-4 text-right font-bold text-slate-700">${formatarMoeda(item.valor)}</td>
            <td class="py-3 px-4 text-center">${botaoItens}</td>
            <td class="py-3 px-4 text-center space-x-2">
                <button onclick='abrirModalEditar(${JSON.stringify(item)})' class="text-indigo-600 hover:text-indigo-800 p-1" title="Editar"><i class="fa-solid fa-pen-to-square"></i></button>
                <button onclick="deletarRegistro('CartaoDeCredito', ${item.rowIndex})" class="text-rose-500 hover:text-rose-700 p-1" title="Excluir"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function toggleVisualizarItens(idCompra) {
    const el = document.getElementById(`subitens-${idCompra}`);
    if (el) el.classList.toggle('hidden');
}

function renderizarDespesas() {
    const tbody = document.getElementById('tabelaDespesasCorpo');
    tbody.innerHTML = '';
    const lista = dadosGlobaisExtrato.filter(item => item.tipo === 'Despesas');
    document.getElementById('contadorDespesas').innerText = `${lista.length} itens`;

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-6 text-center text-slate-400">Nenhuma despesa encontrada.</td></tr>`;
        return;
    }

    lista.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50/50 transition border-b border-slate-50";
        tr.innerHTML = `
            <td class="py-3 px-4 text-slate-600">${item.data}</td>
            <td class="py-3 px-4 font-medium text-slate-800">${item.descricao}</td>
            <td class="py-3 px-4 text-slate-600">${item.categoria || '-'}</td>
            <td class="py-3 px-4 text-slate-600">${item.forma || '-'}</td>
            <td class="py-3 px-4 text-right font-bold text-rose-600">${formatarMoeda(item.valor)}</td>
            <td class="py-3 px-4 text-center space-x-2">
                <button onclick='abrirModalEditar(${JSON.stringify(item)})' class="text-indigo-600 hover:text-indigo-800 p-1"><i class="fa-solid fa-pen-to-square"></i></button>
                <button onclick="deletarRegistro('Despesas', ${item.rowIndex})" class="text-rose-500 hover:text-rose-700 p-1"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderizarRendas() {
    const tbody = document.getElementById('tabelaRendasCorpo');
    tbody.innerHTML = '';
    const lista = dadosGlobaisExtrato.filter(item => item.tipo === 'Rendas');
    document.getElementById('contadorRendas').innerText = `${lista.length} itens`;

    if (lista.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-400">Nenhuma renda encontrada.</td></tr>`;
        return;
    }

    lista.forEach(item => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50/50 transition border-b border-slate-50";
        tr.innerHTML = `
            <td class="py-3 px-4 text-slate-600">${item.data}</td>
            <td class="py-3 px-4 font-medium text-slate-800">${item.descricao}</td>
            <td class="py-3 px-4 text-slate-600">${item.categoria || '-'}</td>
            <td class="py-3 px-4 text-right font-bold text-emerald-600">${formatarMoeda(item.valor)}</td>
            <td class="py-3 px-4 text-center space-x-2">
                <button onclick='abrirModalEditar(${JSON.stringify(item)})' class="text-indigo-600 hover:text-indigo-800 p-1"><i class="fa-solid fa-pen-to-square"></i></button>
                <button onclick="deletarRegistro('Rendas', ${item.rowIndex})" class="text-rose-500 hover:text-rose-700 p-1"><i class="fa-solid fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function abrirModalRegistro(tipo) {
    document.getElementById('modalTipoAba').value = tipo;
    document.getElementById('modalRowIndex').value = '';
    document.getElementById('modalIdCompra').value = '';
    document.getElementById('modalTitulo').innerText = 'Novo Registro - ' + tipo;
    document.getElementById('modalData').value = obterDataLocalISO();
    document.getElementById('modalValor').value = '';
    document.getElementById('modalDescricao').value = '';
    document.getElementById('modalCategoria').value = '';
    document.getElementById('modalFaturaMes').value = obterMesSeguintePadrao();
    document.getElementById('modalForma').value = '';
    document.getElementById('modalParcela').value = '1/1';
    document.getElementById('listaSubItensContainer').innerHTML = '';

    atualizarDatalistsDinamicos();
    configurarVisibilidadeCampos(tipo);
    document.getElementById('modalRegistro').classList.remove('hidden');
    document.getElementById('modalRegistro').classList.add('flex');
}

function abrirModalEditar(item) {
    document.getElementById('modalTipoAba').value = item.tipo;
    document.getElementById('modalRowIndex').value = item.rowIndex;
    document.getElementById('modalIdCompra').value = item.idCompra || '';
    document.getElementById('modalTitulo').innerText = 'Editar Registro - ' + item.tipo;

    if (item.data && item.data.includes('/')) {
        const partes = item.data.split('/');
        document.getElementById('modalData').value = `${partes[2]}-${partes[1]}-${partes[0]}`;
    }

    document.getElementById('modalValor').value = formatarMoeda(item.valor);
    document.getElementById('modalDescricao').value = item.descricao || '';
    document.getElementById('modalCategoria').value = item.categoria || '';
    document.getElementById('modalFaturaMes').value = item.faturaMes || obterMesSeguintePadrao();
    document.getElementById('modalForma').value = item.forma || '';
    document.getElementById('modalParcela').value = item.parcela || '1/1';

    atualizarDatalistsDinamicos();
    configurarVisibilidadeCampos(item.tipo);

    const container = document.getElementById('listaSubItensContainer');
    container.innerHTML = '';
    if (item.tipo === 'CartaoDeCredito') {
        const subItens = dadosGlobaisItensCartao.filter(sub => parseInt(sub.idCompra) === parseInt(item.idCompra));
        subItens.forEach(sub => adicionarLinhaSubItem(sub.tipoSub || 'debito', sub.descricao, formatarMoeda(sub.valor), false));
    }
    validarSomaItensCartao();

    document.getElementById('modalRegistro').classList.remove('hidden');
    document.getElementById('modalRegistro').classList.add('flex');
}

function configurarVisibilidadeCampos(tipo) {
    document.getElementById('grupoFaturaMes').classList.add('hidden');
    document.getElementById('grupoForma').classList.add('hidden');
    document.getElementById('grupoParcela').classList.add('hidden');
    document.getElementById('painelSubItensCartao').classList.add('hidden');

    if (tipo === 'CartaoDeCredito') {
        document.getElementById('grupoFaturaMes').classList.remove('hidden');
        document.getElementById('grupoParcela').classList.remove('hidden');
        document.getElementById('painelSubItensCartao').classList.remove('hidden');
        document.getElementById('labelDescricao').innerText = 'Estabelecimento';
    } else if (tipo === 'Despesas') {
        document.getElementById('grupoForma').classList.remove('hidden');
        document.getElementById('labelDescricao').innerText = 'Descrição';
    } else {
        document.getElementById('labelDescricao').innerText = 'Descrição';
    }
}

function fecharModalRegistro() {
    document.getElementById('modalRegistro').classList.remove('flex');
    document.getElementById('modalRegistro').classList.add('hidden');
}

function adicionarLinhaSubItem(tipoSub = 'debito', desc = '', val = '', focar = false) {
    const container = document.getElementById('listaSubItensContainer');
    const div = document.createElement('div');
    div.className = "flex items-center space-x-1.5 sub-item-linha";
    
    let btnClass = tipoSub === 'credito' 
        ? 'bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100' 
        : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200';
    let btnIcon = tipoSub === 'credito' ? '<i class="fa-solid fa-minus text-xs"></i>' : '<i class="fa-solid fa-plus text-xs"></i>';
    let btnTitle = tipoSub === 'credito' ? 'Tipo: Cupom/Crédito (-)' : 'Tipo: Débito (+)';

    div.innerHTML = `
        <input type="text" list="listaSugestoesItens" placeholder="Nome do item..." value="${desc}" onchange="aoSelecionarItemSub(this)" class="flex-grow bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-500 item-desc">
        <input type="text" placeholder="R$ 0,00" value="${val}" oninput="mascaraValorBanco(this); validarSomaItensCartao()" class="w-20 bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-lg px-2 py-1.5 outline-none focus:border-indigo-500 item-valor">
        <input type="hidden" class="item-tipo" value="${tipoSub}">
        <button type="button" onclick="alternarTipoSubItem(this)" class="w-7 h-7 rounded-lg border flex items-center justify-center transition ${btnClass}" title="${btnTitle}">
            ${btnIcon}
        </button>
        <div class="flex flex-col -space-y-1">
            <button type="button" onclick="moverSubItem(this, 'cima')" class="text-slate-400 hover:text-indigo-600 px-1 text-[9px]" title="Mover para cima"><i class="fa-solid fa-caret-up"></i></button>
            <button type="button" onclick="moverSubItem(this, 'baixo')" class="text-slate-400 hover:text-indigo-600 px-1 text-[9px]" title="Mover para baixo"><i class="fa-solid fa-caret-down"></i></button>
        </div>
        <button type="button" onclick="removerLinhaSubItem(this)" class="text-rose-400 hover:text-rose-600 px-1" title="Excluir item"><i class="fa-solid fa-trash-can text-xs"></i></button>
    `;
    container.appendChild(div);

    if (focar) {
        const inputDesc = div.querySelector('.item-desc');
        if (inputDesc) inputDesc.focus();
    }
    validarSomaItensCartao();
}

function moverSubItem(btn, direcao) {
    const linhaAtual = btn.closest('.sub-item-linha');
    if (direcao === 'cima') {
        const linhaAnterior = linhaAtual.previousElementSibling;
        if (linhaAnterior) {
            linhaAtual.parentNode.insertBefore(linhaAtual, linhaAnterior);
        }
    } else if (direcao === 'baixo') {
        const linhaProxima = linhaAtual.nextElementSibling;
        if (linhaProxima) {
            linhaAtual.parentNode.insertBefore(linhaProxima, linhaAtual);
        }
    }
    validarSomaItensCartao();
}

function aoSelecionarItemSub(inputDesc) {
    const nomeEscolhido = inputDesc.value.trim();
    if (!nomeEscolhido) return;

    const itemEncontrado = dadosGlobaisItensCartao.slice().reverse().find(i => i.descricao.toLowerCase() === nomeEscolhido.toLowerCase());

    if (itemEncontrado) {
        const linha = inputDesc.closest('.sub-item-linha');
        const inputValor = linha.querySelector('.item-valor');
        const inputTipo = linha.querySelector('.item-tipo');
        const btnTipo = linha.querySelector('button[title*="Tipo:"]');

        if (inputValor && itemEncontrado.valor) {
            inputValor.value = formatarMoeda(itemEncontrado.valor);
        }

        if (inputTipo && btnTipo) {
            const tipoSalvo = itemEncontrado.tipoSub || 'debito';
            inputTipo.value = tipoSalvo;

            if (tipoSalvo === 'credito') {
                btnTipo.className = "w-7 h-7 rounded-lg border flex items-center justify-center transition bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100";
                btnTipo.innerHTML = '<i class="fa-solid fa-minus text-xs"></i>';
                btnTipo.title = 'Tipo: Cupom/Crédito (-)';
            } else {
                btnTipo.className = "w-7 h-7 rounded-lg border flex items-center justify-center transition bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200";
                btnTipo.innerHTML = '<i class="fa-solid fa-plus text-xs"></i>';
                btnTipo.title = 'Tipo: Débito (+)';
            }
        }

        validarSomaItensCartao();
    }
}

function alternarTipoSubItem(btn) {
    const divLinha = btn.closest('.sub-item-linha');
    const inputTipo = divLinha.querySelector('.item-tipo');
    if (inputTipo.value === 'debito') {
        inputTipo.value = 'credito';
        btn.className = "w-7 h-7 rounded-lg border flex items-center justify-center transition bg-emerald-50 text-emerald-600 border-emerald-200 hover:bg-emerald-100";
        btn.innerHTML = '<i class="fa-solid fa-minus text-xs"></i>';
    } else {
        inputTipo.value = 'debito';
        btn.className = "w-7 h-7 rounded-lg border flex items-center justify-center transition bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200";
        btn.innerHTML = '<i class="fa-solid fa-plus text-xs"></i>';
    }
    validarSomaItensCartao();
}

function removerLinhaSubItem(btn) {
    btn.closest('.sub-item-linha').remove();
    validarSomaItensCartao();
}

function validarSomaItensCartao() {
    const tipo = document.getElementById('modalTipoAba').value;
    if (tipo !== 'CartaoDeCredito') return;

    const valorDigitado = converterMoedaParaNumero(document.getElementById('modalValor').value);
    const parcelaStr = document.getElementById('modalParcela').value.trim();
    let qtdParcelas = 1;
    if (parcelaStr.includes('/')) {
        const partesP = parcelaStr.split('/');
        let totalY = parseInt(partesP[1]);
        if (!isNaN(totalY) && totalY > 0) qtdParcelas = totalY;
    }

    const valorEsperado = valorDigitado * qtdParcelas;
    const linhas = document.querySelectorAll('.sub-item-linha');
    let somaItens = 0;
    linhas.forEach(linha => {
        const tipoSub = linha.querySelector('.item-tipo').value;
        const valorSub = converterMoedaParaNumero(linha.querySelector('.item-valor').value);
        if (tipoSub === 'credito') somaItens -= valorSub;
        else somaItens += valorSub;
    });

    document.getElementById('lblSomaItens').innerText = formatarMoeda(somaItens);
    const statusLbl = document.getElementById('lblStatusSoma');
    if (linhas.length > 0 && Math.abs(somaItens - valorEsperado) > 0.01) {
        statusLbl.className = "text-amber-500 font-bold";
        statusLbl.innerText = `Aviso: Diverge do Total (Esp: ${formatarMoeda(valorEsperado)}) ⚠`;
    } else {
        statusLbl.className = "text-emerald-600 font-bold";
        statusLbl.innerText = "Validado ✓";
    }
}

function salvarRegistro() {
    const tipo = document.getElementById('modalTipoAba').value;
    const rowIndex = document.getElementById('modalRowIndex').value;
    const idCompra = document.getElementById('modalIdCompra').value;
    const dataInput = document.getElementById('modalData').value;
    const valorNumerico = converterMoedaParaNumero(document.getElementById('modalValor').value);
    const descricao = document.getElementById('modalDescricao').value;
    const categoria = document.getElementById('modalCategoria').value;
    const faturaMes = document.getElementById('modalFaturaMes').value;
    const forma = document.getElementById('modalForma').value;
    const parcela = document.getElementById('modalParcela').value;

    if (!dataInput || valorNumerico <= 0 || !descricao) {
        alert("Preencha os campos obrigatórios (Data, Valor válido e Descrição/Estabelecimento).");
        return;
    }

    const partesData = dataInput.split('-');
    const dataFormatada = `${partesData[2]}/${partesData[1]}/${partesData[0]}`;

    let params = {
        action: rowIndex ? 'editar' : 'inserir',
        tipo: tipo,
        rowIndex: rowIndex,
        idCompra: idCompra,
        data: dataFormatada,
        valor: valorNumerico,
        descricao: descricao,
        categoria: categoria,
        faturaMes: faturaMes,
        forma: forma,
        parcela: parcela
    };

    if (tipo === 'CartaoDeCredito') {
        const linhas = document.querySelectorAll('.sub-item-linha');
        let itensArray = [];
        linhas.forEach(linha => {
            const tipoSub = linha.querySelector('.item-tipo').value;
            const descItem = linha.querySelector('.item-desc').value.trim();
            const valItem = converterMoedaParaNumero(linha.querySelector('.item-valor').value);
            if (descItem && valItem > 0) {
                itensArray.push({ tipoSub: tipoSub, descricao: descItem, valor: valItem });
            }
        });
        params.itensJson = JSON.stringify(itensArray);
    }

    const queryString = new URLSearchParams(params).toString();
    const inicio = iniciarTemporizadorTempoReal();
    fetch(URL_API + "?" + queryString)
        .then(res => res.json())
        .then(resposta => {
            pararTemporizadorTempoReal(inicio);
            fecharModalRegistro();
            carregarDados();
        })
        .catch(err => {
            pararTemporizadorTempoReal(inicio);
            alert("Erro ao salvar registro.");
        });
}

function deletarRegistro(tipo, rowIndex) {
    if (!confirm("Tem certeza que deseja excluir este registro e todas as suas parcelas associadas?")) return;

    const params = new URLSearchParams({
        action: 'deletar',
        tipo: tipo,
        rowIndex: rowIndex
    }).toString();

    const inicio = iniciarTemporizadorTempoReal();
    fetch(URL_API + "?" + params)
        .then(res => res.json())
        .then(resposta => {
            pararTemporizadorTempoReal(inicio);
            carregarDados();
        })
        .catch(err => {
            pararTemporizadorTempoReal(inicio);
            alert("Erro ao excluir registro.");
        });
}

function formatarMoeda(valor) {
    return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}