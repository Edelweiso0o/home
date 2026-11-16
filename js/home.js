/* ============================================================
   Central de Projetos - script da página HOME
   ------------------------------------------------------------
   Só comportamento de interface: relógio, destaque do card,
   ano no rodapé. Nenhum acesso a dados/API aqui.
   ============================================================ */

// ---- Configuração de tema para o Tailwind CDN ----
// (vinha do js/main.js local; o main.js do GitHub é backend e não serve aqui)
if (typeof tailwind !== 'undefined') {
  tailwind.config = {
    darkMode: 'class',
    theme: {
      extend: {
        colors: {
          dark: {
            bg: '#0b0f17',
            card: '#151c28',
            border: '#1f293d',
            accent: '#6366f1'
          }
        }
      }
    }
  };
}

(function () {
  'use strict';

  // ---- Relógio local (24h, fuso America/Sao_Paulo) ----
  var elRelogio = document.getElementById('relogioLocal');
  if (elRelogio) {
    var formato = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
    var tick = function () {
      elRelogio.textContent = formato.format(new Date());
    };
    tick();
    setInterval(tick, 1000);
  }

  // ---- Contagem de módulos no subtítulo (data-modulos) ----
  var cards = document.querySelectorAll('[data-projeto]');
  var elContagem = document.querySelector('[data-contagem-projetos]');
  if (elContagem && cards.length) {
    elContagem.textContent = cards.length + ' módulos ativos';
  }

  // ---- Filtro/atalho: digitar para achar um projeto ----
  var campoBusca = document.getElementById('buscaProjeto');
  if (campoBusca && cards.length) {
    campoBusca.addEventListener('input', function () {
      var termo = campoBusca.value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

      Array.prototype.forEach.call(cards, function (card) {
        var alvo = [
          card.getAttribute('data-projeto') || '',
          card.textContent || ''
        ].join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        var visivel = termo === '' || alvo.indexOf(termo) !== -1;
        // Esconde o próprio card: todos os cards são irmãos dentro do mesmo grid.
        card.classList.toggle('busca-oculto', !visivel);
      });
    });
  }
})();
