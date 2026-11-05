async function iniciarMissao(id) {
    if (!estadoPonto.trabalhando) {
        mostrarNotificacao("Atenção", "Você está de folga! Bata o ponto para iniciar.", "aviso");
        return;
    }

    const missao = encontrarMissaoHoje(id);
    if (missao) {
        const dataAtual = new Date();
        const horaInicioExata = String(dataAtual.getHours()).padStart(2, '0') + ":" + String(dataAtual.getMinutes()).padStart(2, '0') + ":" + String(dataAtual.getSeconds()).padStart(2, '0');

        missao.estadoMissao = 'EmAndamento';
        missao.status = 'Em Andamento';
        missao.tempoInicioMs = dataAtual.getTime();
        
        salvarDadosLocalStorage();
        renderizarVisaoAtual();
        
        mostrarNotificacao("Missão Iniciada", `Cronômetro rodando para: ${missao.titulo}`, "sucesso", 2000);

        sincronizarComServidor('atualizarEstadoMissao', { id: missao.id, titulo: missao.titulo, estadoMissao: 'EmAndamento', horaExata: horaInicioExata });
    }
}

async function concluirMissao(id) {
    if (!estadoPonto.trabalhando) {
        mostrarNotificacao("Atenção", "Você está de folga!", "aviso");
        return;
    }

    const missao = encontrarMissaoHoje(id);
    if (!missao) return;

    const dataAtual = new Date();
    const horaTerminoExata = String(dataAtual.getHours()).padStart(2, '0') + ":" + String(dataAtual.getMinutes()).padStart(2, '0') + ":" + String(dataAtual.getSeconds()).padStart(2, '0');

    if (missao.tempoInicioMs) {
        const diffMin = Math.round((dataAtual.getTime() - missao.tempoInicioMs) / 60000);
        missao.tempoRealMin = diffMin > 0 ? diffMin : 1;
    } else {
        missao.tempoRealMin = missao.tempoEstimado;
    }

    missao.status = 'Concluído';
    missao.estadoMissao = 'Concluído';
    contadorConcluidas++;

    salvarDadosLocalStorage();
    renderizarVisaoAtual();
    
    mostrarNotificacao("Missão Concluída!", "Tarefa finalizada com sucesso.", "sucesso", 2500);

    sincronizarComServidor('concluirMissao', { 
        id: missao.id, 
        titulo: missao.titulo,
        horaExata: horaTerminoExata,
        tempoRealMin: missao.tempoRealMin 
    });
}

async function alternarNaoFazerHoje(id) {
    const missao = encontrarMissaoHoje(id);
    if (missao) {
        missao.status = 'Cancelado';
        missao.estadoMissao = 'Cancelado';
        
        salvarDadosLocalStorage();
        renderizarVisaoAtual();
        mostrarNotificacao("Cancelado", "Missão cancelada para hoje.", "atencao", 2000);

        sincronizarComServidor('atualizarEstadoMissao', { id: missao.id, titulo: missao.titulo, estadoMissao: 'Cancelado' });
    }
}