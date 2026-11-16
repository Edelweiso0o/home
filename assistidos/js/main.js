/* ============================================================
   Assistidos - camada de dados e interface (esqueleto)
   ------------------------------------------------------------
   ESTADO ATUAL: persistência local (localStorage).
   PENDENTE: quando os arquivos do VBA chegarem, esta camada é
   trocada por chamadas à API (/api) + Google Sheets, mantendo
   a mesma interface (listar / salvar / remover) para a UI.
   ============================================================ */
(function () {
    'use strict';

    // ---- CHAVE DE ACESSO DA API (usada quando o backend entrar) ----
    var API_URL = '/api';
    var CHAVE_STORAGE = 'assistidos.itens.v1';

    // ============================================================
    // Camada de dados
    // ============================================================

    function lerLocal() {
        try {
            var bruto = localStorage.getItem(CHAVE_STORAGE);
            if (!bruto) return null;
            var dados = JSON.parse(bruto);
            return Array.isArray(dados) ? dados : null;
        } catch (e) {
            console.warn('Falha ao ler localStorage:', e);
            return null;
        }
    }

    function gravarLocal(itens) {
        localStorage.setItem(CHAVE_STORAGE, JSON.stringify(itens));
    }

    function novoId() {
        return 'it_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    }

    // Data local (America/Sao_Paulo não é garantido pelo navegador do usuário,
    // mas toISOString() em UTC pode adiantar um dia à noite). Aqui usamos a
    // data do fuso local do aparelho, que é o que o diário representa.
    function hojeISO() {
        var d = new Date();
        var mes = String(d.getMonth() + 1).padStart(2, '0');
        var dia = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + mes + '-' + dia;
    }

    // Item de exemplo (só na primeira visita, pra tela não nascer vazia)
    function itensExemplo() {
        return [
            {
                id: novoId(), titulo: 'Breaking Bad', tipo: 'serie', status: 'completo',
                temporada: 5, epAtual: 62, epTotal: 62, nota: 5, onde: 'Netflix',
                comentario: 'Série de exemplo — apague quando começar a usar de verdade.',
                criadoEm: hojeISO(), atualizadoEm: hojeISO()
            },
            {
                id: novoId(), titulo: 'Frieren', tipo: 'anime', status: 'assistindo',
                temporada: 1, epAtual: 12, epTotal: 28, nota: 5, onde: 'Crunchyroll',
                comentario: '', criadoEm: hojeISO(), atualizadoEm: hojeISO()
            },
            {
                id: novoId(), titulo: 'Duna: Parte 2', tipo: 'filme', status: 'completo',
                temporada: 0, epAtual: 1, epTotal: 1, nota: 4, onde: 'Cinema',
                comentario: '', criadoEm: hojeISO(), atualizadoEm: hojeISO()
            }
        ];
    }

    function carregar() {
        var itens = lerLocal();
        if (itens === null) {
            itens = itensExemplo();
            gravarLocal(itens);
        }
        return itens;
    }

    // ============================================================
    // Utilitários de apresentação
    // ============================================================

    var ROTULOS_TIPO = {
        filme: 'Filme', serie: 'Série', anime: 'Anime',
        dorama: 'Dorama', documentario: 'Doc'
    };

    var ROTULOS_STATUS = {
        assistindo: 'Assistindo', completo: 'Completo', pausado: 'Pausado',
        largado: 'Largado', quero_ver: 'Quero ver'
    };

    function escaparHTML(txt) {
        return String(txt == null ? '' : txt)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function normalizar(txt) {
        return String(txt || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    }

    function estrelas(nota) {
        if (nota === null || nota === undefined || nota === '') return '';
        var n = Math.max(0, Math.min(5, parseInt(nota, 10)));
        var html = '';
        for (var i = 1; i <= 5; i++) {
            html += i <= n
                ? '<span>★</span>'
                : '<span class="vazia">★</span>';
        }
        return html;
    }

    function dataBR(iso) {
        if (!iso) return '';
        var p = String(iso).slice(0, 10).split('-');
        if (p.length !== 3) return iso;
        return p[2] + '/' + p[1] + '/' + p[0];
    }

    // ============================================================
    // Estado da tela
    // ============================================================

    var itens = carregar();
    var filtros = { busca: '', tipo: '', status: '', nota: '' };

    var elCards = document.getElementById('cards');
    var elVazio = document.getElementById('vazio');
    var elContadorLista = document.getElementById('contadorLista');
    var elContadorTotal = document.getElementById('contadorTotal');
    var elBusca = document.getElementById('busca');
    var elFiltroTipo = document.getElementById('filtroTipo');
    var elFiltroStatus = document.getElementById('filtroStatus');
    var elFiltroNota = document.getElementById('filtroNota');
    var elModal = document.getElementById('modal');
    var elModalTitulo = document.getElementById('modalTitulo');
    var elForm = document.getElementById('formItem');
    var elErroForm = document.getElementById('erroForm');

    function listaFiltrada() {
        return itens.filter(function (item) {
            if (filtros.tipo && item.tipo !== filtros.tipo) return false;
            if (filtros.status && item.status !== filtros.status) return false;

            if (filtros.nota) {
                var nota = item.nota;
                var semNota = nota === null || nota === undefined || nota === '';
                if (filtros.nota === '0') {
                    if (!semNota) return false;
                } else {
                    if (semNota || parseInt(nota, 10) < parseInt(filtros.nota, 10)) return false;
                }
            }

            if (filtros.busca) {
                var alvo = normalizar(item.titulo + ' ' + (item.onde || '') + ' ' + (item.comentario || ''));
                if (alvo.indexOf(normalizar(filtros.busca)) === -1) return false;
            }

            return true;
        });
    }

    function cardHTML(item) {
        var total = parseInt(item.epTotal, 10) || 0;
        var atual = parseInt(item.epAtual, 10) || 0;
        var pct = total > 0 ? Math.min(100, Math.round((atual / total) * 100)) : 0;

        var progressoHTML = '';
        if (total > 0) {
            progressoHTML =
                '<div class="progresso">' +
                    '<div class="progresso-texto">' +
                        '<span>EP ' + escaparHTML(atual) + ' / ' + escaparHTML(total) + '</span>' +
                        '<span>' + pct + '%</span>' +
                    '</div>' +
                    '<div class="barra"><span style="width:' + pct + '%"></span></div>' +
                '</div>';
        }

        var tempHTML = (parseInt(item.temporada, 10) || 0) > 0
            ? '<span class="tag">T' + escaparHTML(item.temporada) + '</span>'
            : '';

        var notaHTML = (item.nota !== null && item.nota !== undefined && item.nota !== '')
            ? '<div class="nota" title="Nota">' + estrelas(item.nota) + '</div>'
            : '';

        var comentarioHTML = item.comentario
            ? '<p class="card-comentario">“' + escaparHTML(item.comentario) + '”</p>'
            : '';

        var ondeHTML = item.onde
            ? '<span><i class="fa-solid fa-tv"></i> ' + escaparHTML(item.onde) + '</span>'
            : '';

        return '' +
            '<article class="card" data-id="' + escaparHTML(item.id) + '">' +
                '<div class="card-top">' +
                    '<h3 class="card-titulo">' + escaparHTML(item.titulo || 'Sem título') + '</h3>' +
                    '<button type="button" class="btn-perigo" data-acao="remover" data-id="' + escaparHTML(item.id) + '" title="Remover" aria-label="Remover ' + escaparHTML(item.titulo || 'item') + '">' +
                        '<i class="fa-solid fa-trash"></i>' +
                    '</button>' +
                '</div>' +
                '<div class="card-meta">' +
                    '<span class="tag">' + escaparHTML(ROTULOS_TIPO[item.tipo] || item.tipo) + '</span>' +
                    '<span class="tag status-' + escaparHTML(item.status) + '">' + escaparHTML(ROTULOS_STATUS[item.status] || item.status) + '</span>' +
                    tempHTML +
                '</div>' +
                progressoHTML +
                notaHTML +
                comentarioHTML +
                '<div class="card-footer">' +
                    '<span>' + ondeHTML + '</span>' +
                    '<div class="card-acoes">' +
                        '<button type="button" class="btn-perigo" data-acao="editar" data-id="' + escaparHTML(item.id) + '" title="Editar" aria-label="Editar ' + escaparHTML(item.titulo || 'item') + '">' +
                            '<i class="fa-solid fa-pen"></i>' +
                        '</button>' +
                    '</div>' +
                '</div>' +
            '</article>';
    }

    function render() {
        var lista = listaFiltrada();

        // Mais recentes primeiro
        lista.sort(function (a, b) {
            var da = a.atualizadoEm || a.criadoEm || '';
            var db = b.atualizadoEm || b.criadoEm || '';
            if (da === db) return String(a.titulo).localeCompare(String(b.titulo));
            return db.localeCompare(da);
        });

        if (lista.length === 0) {
            elCards.innerHTML = '';
            elVazio.hidden = false;
        } else {
            elVazio.hidden = true;
            elCards.innerHTML = lista.map(cardHTML).join('');
        }

        elContadorTotal.textContent = itens.length + (itens.length === 1 ? ' item' : ' itens');
        elContadorLista.textContent = lista.length + ' de ' + itens.length;
    }

    // ============================================================
    // Modal
    // ============================================================

    var campos = {
        id: document.getElementById('campoId'),
        titulo: document.getElementById('campoTitulo'),
        tipo: document.getElementById('campoTipo'),
        status: document.getElementById('campoStatus'),
        temporada: document.getElementById('campoTemporada'),
        epAtual: document.getElementById('campoEpAtual'),
        epTotal: document.getElementById('campoEpTotal'),
        nota: document.getElementById('campoNota'),
        onde: document.getElementById('campoOnde'),
        comentario: document.getElementById('campoComentario')
    };

    function limparForm() {
        campos.id.value = '';
        campos.titulo.value = '';
        campos.tipo.value = 'serie';
        campos.status.value = 'assistindo';
        campos.temporada.value = '';
        campos.epAtual.value = '';
        campos.epTotal.value = '';
        campos.nota.value = '';
        campos.onde.value = '';
        campos.comentario.value = '';
        campos.titulo.classList.remove('invalido');
        elErroForm.hidden = true;
        elErroForm.textContent = '';
    }

    function abrirModal(item) {
        limparForm();
        if (item) {
            elModalTitulo.textContent = 'Editar item';
            campos.id.value = item.id;
            campos.titulo.value = item.titulo || '';
            campos.tipo.value = item.tipo || 'serie';
            campos.status.value = item.status || 'assistindo';
            campos.temporada.value = item.temporada || '';
            campos.epAtual.value = item.epAtual || '';
            campos.epTotal.value = item.epTotal || '';
            campos.nota.value = (item.nota === null || item.nota === undefined) ? '' : item.nota;
            campos.onde.value = item.onde || '';
            campos.comentario.value = item.comentario || '';
        } else {
            elModalTitulo.textContent = 'Novo item';
        }
        elModal.hidden = false;
        setTimeout(function () { campos.titulo.focus(); }, 30);
    }

    function fecharModal() {
        elModal.hidden = true;
    }

    // ============================================================
    // Ações
    // ============================================================

    function salvarItem(evento) {
        evento.preventDefault();

        var titulo = campos.titulo.value.trim();
        if (!titulo) {
            campos.titulo.classList.add('invalido');
            elErroForm.textContent = 'Informe o título.';
            elErroForm.hidden = false;
            campos.titulo.focus();
            return;
        }

        var notaBruta = campos.nota.value;
        var nota = notaBruta === '' ? null : parseInt(notaBruta, 10);

        var dados = {
            titulo: titulo,
            tipo: campos.tipo.value,
            status: campos.status.value,
            temporada: campos.temporada.value === '' ? 0 : parseInt(campos.temporada.value, 10),
            epAtual: campos.epAtual.value === '' ? 0 : parseInt(campos.epAtual.value, 10),
            epTotal: campos.epTotal.value === '' ? 0 : parseInt(campos.epTotal.value, 10),
            nota: nota,
            onde: campos.onde.value.trim(),
            comentario: campos.comentario.value.trim(),
            atualizadoEm: hojeISO()
        };

        // Coerência básica: episódio atual não passa do total
        if (dados.epTotal > 0 && dados.epAtual > dados.epTotal) {
            dados.epAtual = dados.epTotal;
        }

        var id = campos.id.value.trim();
        if (id) {
            for (var i = 0; i < itens.length; i++) {
                if (itens[i].id === id) {
                    itens[i] = Object.assign({}, itens[i], dados);
                    break;
                }
            }
        } else {
            itens.push(Object.assign({
                id: novoId(),
                criadoEm: hojeISO()
            }, dados));
        }

        gravarLocal(itens);
        fecharModal();
        render();
    }

    function removerItem(id) {
        var alvo = null;
        for (var i = 0; i < itens.length; i++) {
            if (itens[i].id === id) { alvo = itens[i]; break; }
        }
        if (!alvo) return;
        itens = itens.filter(function (item) { return item.id !== id; });
        gravarLocal(itens);
        render();
        avisar('"' + alvo.titulo + '" removido do diário.', function () {
            // Desfazer: recoloca o item exatamente como estava
            itens.push(alvo);
            gravarLocal(itens);
            render();
        });
    }

    function editarItem(id) {
        for (var i = 0; i < itens.length; i++) {
            if (itens[i].id === id) { abrirModal(itens[i]); return; }
        }
    }

    // ============================================================
    // Aviso com ação de desfazer (substitui o confirm() nativo,
    // que bloqueia a página e não pode ser estilizado)
    // ============================================================
    var elToast = document.getElementById('toast');
    var elToastTexto = document.getElementById('toastTexto');
    var elToastDesfazer = document.getElementById('toastDesfazer');
    var timerToast = null;
    var acaoDesfazer = null;

    function fecharToast() {
        if (timerToast) { clearTimeout(timerToast); timerToast = null; }
        elToast.hidden = true;
        acaoDesfazer = null;
    }

    function avisar(mensagem, desfazer) {
        elToastTexto.textContent = mensagem;
        acaoDesfazer = desfazer || null;
        elToastDesfazer.hidden = !desfazer;
        elToast.hidden = false;
        if (timerToast) clearTimeout(timerToast);
        timerToast = setTimeout(fecharToast, 6000);
    }

    elToastDesfazer.addEventListener('click', function () {
        var fn = acaoDesfazer;
        fecharToast();
        if (fn) fn();
    });

    // ============================================================
    // Eventos
    // ============================================================

    document.getElementById('btnNovo').addEventListener('click', function () { abrirModal(null); });
    document.getElementById('btnCancelar').addEventListener('click', fecharModal);
    document.getElementById('btnFecharModal').addEventListener('click', fecharModal);
    elForm.addEventListener('submit', salvarItem);

    elModal.addEventListener('click', function (e) {
        if (e.target === elModal) fecharModal();
    });

    document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && !elModal.hidden) fecharModal();
    });

    elCards.addEventListener('click', function (e) {
        var botao = e.target.closest('[data-acao]');
        if (!botao) return;
        var acao = botao.getAttribute('data-acao');
        var id = botao.getAttribute('data-id');
        if (acao === 'editar') editarItem(id);
        if (acao === 'remover') removerItem(id);
    });

    elBusca.addEventListener('input', function () {
        filtros.busca = elBusca.value;
        render();
    });

    elFiltroTipo.addEventListener('change', function () { filtros.tipo = elFiltroTipo.value; render(); });
    elFiltroStatus.addEventListener('change', function () { filtros.status = elFiltroStatus.value; render(); });
    elFiltroNota.addEventListener('change', function () { filtros.nota = elFiltroNota.value; render(); });

    // Aviso de esqueleto: fecha e lembra a escolha
    var elAviso = document.getElementById('avisoEsqueleto');
    if (localStorage.getItem('assistidos.avisoFechado') === '1') {
        elAviso.hidden = true;
    }
    document.getElementById('btnFecharAviso').addEventListener('click', function () {
        elAviso.hidden = true;
        localStorage.setItem('assistidos.avisoFechado', '1');
    });

    // ---- Início ----
    render();
})();

