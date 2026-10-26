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

// Inicializacao dos eventos
document.addEventListener('DOMContentLoaded', () => {
    setInterval(atualizarRelogio, 1000);
    atualizarRelogio();
});