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

    window.__assistidos_v = '0.2.0';



    // ---- CHAVE DE ACESSO DA API (usada quando o backend entrar) ----

    var API_URL = '/api/assistidos';

    var CHAVE_STORAGE = 'assistidos.itens.v1';



    // ============================================================

    // Camada de dados

    // ============================================================



    // ---- Camada de dados: planilha Google via API (/api/assistidos) ----
    // Mesmo modelo do modulo limpeza. O localStorage guarda apenas o ultimo
    // estado bom, para a tela nao abrir vazia enquanto a rede responde.
    // A chave NAO fica salva no navegador: vive so na memoria desta aba.
    // Quem guarda a senha para preencher o formulario e o gerenciador de senhas.
    var chaveEmMemoria = '';

    function obterChaveAPI() { return chaveEmMemoria; }
    function salvarChaveAPI(c) { chaveEmMemoria = String(c || '').trim(); }

    function reqAPI(metodo, corpo) {
        var opcoes = {
            method: metodo,
            headers: { 'Content-Type': 'application/json', 'X-Api-Key': obterChaveAPI() }
        };
        if (corpo) opcoes.body = JSON.stringify(corpo);
        return fetch(API_URL, opcoes).then(function (r) {
            if (r.status === 401) {
                abrirModalChave('Sessao expirada ou senha incorreta. Entre novamente.');
                throw new Error('NAO_AUTORIZADO');
            }
            return r.json().then(function (j) {
                if (!r.ok) throw new Error(j && j.message ? j.message : ('HTTP ' + r.status));
                return j;
            });
        });
    }

    // ---- Modal da chave de acesso (mesmo esquema do modulo limpeza) ----
    function abrirModalChave(mensagem) {
        var modal = document.getElementById('modalChaveAcesso');
        if (!modal) return;
        var msg = modal.querySelector('#chaveMensagem');
        if (msg) msg.textContent = mensagem || 'Digite a senha para acessar o diario.';
        var erro = modal.querySelector('#erroChave');
        if (erro) erro.classList.add('hidden');
        var senha = modal.querySelector('#inputChaveAcesso');
        if (senha) senha.value = '';
        modal.hidden = false;
        setTimeout(function () { if (senha) senha.focus(); }, 80);
    }

    function fecharModalChave() {
        var modal = document.getElementById('modalChaveAcesso');
        if (modal) modal.hidden = true;
    }

    function confirmarChaveAcesso(evento) {
        if (evento) evento.preventDefault();
        var input = document.getElementById('inputChaveAcesso');
        var erro = document.getElementById('erroChave');
        if (!input) return;
        var chave = input.value.trim();
        if (!chave) {
            if (erro) { erro.textContent = 'Digite a senha.'; erro.hidden = false; }
            return;
        }
        if (erro) { erro.hidden = true; }
        var botao = document.querySelector('#formChaveAcesso button[type="submit"]');
        if (botao) { botao.disabled = true; botao.textContent = 'Entrando...'; }
        function firmar() {
            if (botao) { botao.disabled = false; botao.textContent = 'Entrar'; }
        }
        function falhar(msg) {
            firmar();
            salvarChaveAPI('');
            if (erro) { erro.textContent = msg; erro.hidden = false; }
        }
        fetch(API_URL, { method: 'GET', headers: { 'X-Api-Key': chave } }).then(function (r) {
            return r.text().then(function (corpo) {
                return { status: r.status, corpo: corpo };
            });
        }).then(function (res) {
            if (res.status === 401) return falhar('Senha incorreta. Tente de novo.');
            if (res.status >= 400) return falhar('Erro ' + res.status + ': ' + res.corpo.slice(0, 140));
            var dados;
            try { dados = JSON.parse(res.corpo); } catch (e) { return falhar('Resposta invalida do servidor.'); }
            if (dados && dados.status === 'error') return falhar('API: ' + (dados.message || 'erro desconhecido'));
            salvarChaveAPI(chave);
            firmar();
            fecharModalChave();
            try {
                itens = (dados.obras || []).map(obraParaItem);
                cacheLocal(itens);
                render();
                if (dados.resumo) atualizarResumo(dados.resumo);
            } catch (e) {
                console.error('[assistidos] falha ao desenhar a lista:', e);
                var av = document.getElementById('avisoOffline');
                if (av) { av.hidden = false; av.textContent = 'Erro ao montar a lista: ' + e.message; }
            }
        }).catch(function (e) {
            falhar('Sem conexao: ' + (e && e.message ? e.message : 'falhou'));
        });
    }

    function cacheLocal(lista) {
        try { localStorage.setItem(CHAVE_STORAGE, JSON.stringify(lista)); } catch (e) {}
    }

    function lerCache() {
        try {
            var bruto = localStorage.getItem(CHAVE_STORAGE);
            var dados = bruto ? JSON.parse(bruto) : null;
            return Array.isArray(dados) ? dados : [];
        } catch (e) { return []; }
    }

    // Converte a obra que a API devolve para o formato que a tela ja usa.
    function obraParaItem(o) {
        var temTotal = o.epTotal !== null && o.epTotal !== undefined;
        return {
            id: o.id,
            titulo: o.titulo,
            tipo: o.tipo,
            status: o.status,
            temporada: o.ultimaTemporada || 0,
            epAtual: o.assistidos || 0,
            epTotal: temTotal ? o.epTotal : 0,
            temTotal: temTotal,
            nota: o.nota,
            onde: o.plataforma,
            comentario: o.comentario,
            tituloOriginal: o.tituloOriginal || '',
            ano: o.ano,
            horas: o.horas || 0,
            episodios: o.episodios || [],
            criadoEm: o.criadoEm || '',
            atualizadoEm: o.atualizadoEm || ''
        };
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



    function carregar() {
        itens = lerCache();
        render();

        // Sem a senha em memoria nao adianta chamar: pede primeiro.
        if (!obterChaveAPI()) {
            abrirModalChave();
            return;
        }

        reqAPI('GET').then(function (r) {
            itens = (r.obras || []).map(obraParaItem);
            cacheLocal(itens);
            render();
            if (r.resumo) atualizarResumo(r.resumo);
        }).catch(function (e) {
            if (e.message === 'NAO_AUTORIZADO') return;
            console.warn('[assistidos] API indisponivel:', e.message);
            var el = document.getElementById('avisoOffline');
            if (el) {
                el.hidden = false;
                el.textContent = 'Sem conexao com a planilha: ' + e.message +
                    ' — mostrando os ultimos dados salvos.';
            }
        });
    }

    function atualizarResumo(r) {
        var el = document.getElementById('resumo');
        if (!el) return;
        el.hidden = false;
        el.innerHTML =
            '<span><i class="fa-solid fa-film"></i> ' + r.obras + ' obras</span>' +
            '<span><i class="fa-solid fa-list"></i> ' + r.episodios + ' registros</span>' +
            '<span><i class="fa-solid fa-clock"></i> ' + String(r.horas).replace('.', ',') + ' h assistidas</span>';
    }

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



    // carregar() e chamado no fim do arquivo, quando o DOM e os elementos ja existem
    var itens = [];

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

        if (item.temTotal === false && atual > 0) {
            // Total ainda nao informado: sem barra e sem porcentagem (nao da para calcular).
            progressoHTML =
                '<div class="progresso">' +
                    '<div class="progresso-texto">' +
                        '<span>' + escaparHTML(atual) + (atual === 1 ? ' assistido' : ' assistidos') + '</span>' +
                        '<span class="dica-total">total nao informado</span>' +
                    '</div>' +
                '</div>';
        } else if (total > 0) {

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

        var totalBruto = campos.epTotal.value;
        var notaBruta = campos.nota.value;

        var obra = {
            id: campos.id.value.trim(),
            titulo: titulo,
            tipo: campos.tipo.value,
            status: campos.status.value,
            // Vazio = o dono ainda nao informou o total; o card mostra so o que ja viu.
            epTotal: totalBruto === '' ? null : parseInt(totalBruto, 10),
            nota: notaBruta === '' ? null : parseInt(notaBruta, 10),
            plataforma: campos.onde.value.trim(),
            comentario: campos.comentario.value.trim()
        };

        var botao = document.getElementById('btnSalvar');
        if (botao) botao.disabled = true;

        reqAPI('POST', { acao: 'salvarObra', obra: obra }).then(function () {
            fecharModal();
            carregar();
            avisar(obra.id ? 'Alterações salvas.' : '"' + titulo + '" adicionado ao diário.');
        }).catch(function (e) {
            elErroForm.textContent = 'Não foi possível salvar: ' + e.message;
            elErroForm.hidden = false;
        }).finally(function () {
            if (botao) botao.disabled = false;
        });
    }

    // Remocao direto na planilha: apagar linha no Sheets e definitivo,
    // entao o "desfazer" do toast sai de cena e entra uma confirmacao.
    function removerItem(id) {
        var alvo = null;
        for (var k = 0; k < itens.length; k++) {
            if (itens[k].id === id) { alvo = itens[k]; break; }
        }
        if (!alvo) return;

        var qtd = (alvo.episodios || []).length;
        var msg = 'Remover "' + alvo.titulo + '" do diário?' +
            (qtd ? ' Isso apaga também os ' + qtd + ' registros de episódios dela.' : '');
        if (!confirm(msg)) return;

        reqAPI('POST', { acao: 'removerObra', id: id }).then(function () {
            carregar();
            avisar('"' + alvo.titulo + '" removido do diário.');
        }).catch(function (e) {
            alert('Não foi possível remover: ' + e.message);
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



    window.confirmarChaveAcesso = confirmarChaveAcesso;

    // ---- Início ----
    // O modal da senha abre primeiro: sem a chave a API recusa tudo (401).
    // console.log para confirmar no navegador que este trecho roda.
    console.log('[assistidos] inicio; modal presente:', !!document.getElementById('modalChaveAcesso'));

    render();
    abrirModalChave();

    if (obterChaveAPI()) carregar();
})();



