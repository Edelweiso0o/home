// Configuração de temas para o Tailwind CDN
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

// Atualizador do Relógio no Topo
function atualizarRelogio() {
    const agora = new Date();
    const horas = String(agora.getHours()).padStart(2, '0');
    const minutos = String(agora.getMinutes()).padStart(2, '0');
    const segundos = String(agora.getSeconds()).padStart(2, '0');
    
    const elementoRelogio = document.getElementById('relogioLocal');
    if (elementoRelogio) {
        elementoRelogio.innerText = `${horas}:${minutos}:${segundos}`;
    }
}

// Inicialização dos eventos
document.addEventListener('DOMContentLoaded', () => {
    setInterval(atualizarRelogio, 1000);
    atualizarRelogio();
});