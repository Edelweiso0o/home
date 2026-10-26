const API_URL = "https://script.google.com/macros/s/AKfycbwWAZ897UYa5px-0sQlui88KswONmCBbIGHZywGaUtfL1BmweLMCV7YrHyMpE5-SKfZ/exec";

let listaNPCs = [];
let listaItens = [];
let historicoGlobal = [];

async function inicializar() {
  carregarSelectsSalvos();
  await carregarNPCs();
  await carregarItens();
  await carregarHistorico();
  adicionarListenersContexto();
  inicializarConquistas();
  await carregarConquistasPlanilha();
}

function salvarSelectsLocais() {
  const estado = {
    ano: document.getElementById("selectAno").value,
    estacao: document.getElementById("selectEstacao").value,
    semana: document.getElementById("selectSemana").value,
    slot: document.getElementById("selectSlot").value,
    modo: document.getElementById("filtroModo") ? document.getElementById("filtroModo").value : "historico"
  };
  localStorage.setItem("stardew_selects_contexto", JSON.stringify(estado));
}

function carregarSelectsSalvos() {
  const salvo = localStorage.getItem("stardew_selects_contexto");
  if (!salvo) return;
  try {
    const estado = JSON.parse(salvo);
    if (estado.ano && document.getElementById("selectAno")) document.getElementById("selectAno").value = estado.ano;
    if (estado.estacao && document.getElementById("selectEstacao")) document.getElementById("selectEstacao").value = estado.estacao;
    if (estado.semana && document.getElementById("selectSemana")) document.getElementById("selectSemana").value = estado.semana;
    if (estado.slot && document.getElementById("selectSlot")) document.getElementById("selectSlot").value = estado.slot;
    if (estado.modo && document.getElementById("filtroModo")) document.getElementById("filtroModo").value = estado.modo;
  } catch (e) {
    console.error("Erro ao carregar selects salvos", e);
  }
}

async function carregarNPCs() {
  try {
    const res = await fetch(`${API_URL}?action=getNPCs`);
    listaNPCs = await res.json();
    renderizarChecklist();
    atualizarBloqueioChecklist();
  } catch (err) {
    console.error("Erro ao carregar NPCs:", err);
  }
}

async function carregarItens() {
  try {
    const res = await fetch(`${API_URL}?action=getItens`);
    listaItens = await res.json();
    const datalist = document.getElementById("listaItens");
    if (!datalist) return;
    datalist.innerHTML = "";
    listaItens.forEach(item => {
      const opt = document.createElement("option");
      opt.value = item;
      datalist.appendChild(opt);
    });
  } catch (err) {
    console.error("Erro ao carregar Itens:", err);
  }
}

async function carregarHistorico() {
  const container = document.getElementById("tabelaHistorico");
  if (container) {
    container.innerHTML = "<div style='font-size:7px; text-align:center; padding:8px;'>Carregando histórico...</div>";
  }

  try {
    const res = await fetch(`${API_URL}?action=getRegistros`);
    const dadosReg = await res.json();
    historicoGlobal = dadosReg.registros || [];
    atualizarSelectAnos(dadosReg.anos);
    popularSelectFaltamRodadas();
    filtrarHistorico();
    atualizarBloqueioChecklist();
  } catch (err) {
    if (container) {
      container.innerHTML = "<div style='font-size:7px; text-align:center; color:red; padding:8px;'>Erro ao carregar histórico da planilha.</div>";
    }
  }
}

function renderizarChecklist() {
  const container = document.getElementById("checklistContainer");
  if (!container) return;
  container.innerHTML = "";

  listaNPCs.forEach(npc => {
    const div = document.createElement("div");
    div.className = "checklist-item";
    div.innerHTML = `
      <input type="checkbox" id="chk_${npc}" value="${npc}" onchange="salvarChecksLocal()">
      <label for="chk_${npc}" id="lbl_${npc}">${npc}</label>
    `;
    container.appendChild(div);
  });
}

function adicionarListenersContexto() {
  const ids = ["selectAno", "selectEstacao", "selectSemana", "selectSlot"];
  
  ids.forEach((id, index) => {
    const el = document.getElementById(id);
    if (!el) return;

    el.addEventListener("change", () => {
      for (let i = index + 1; i < ids.length; i++) {
        const subEl = document.getElementById(ids[i]);
        if (subEl && subEl.options.length > 0) {
          subEl.selectedIndex = 0;
        }
      }

      salvarSelectsLocais();
      atualizarBloqueioChecklist();
      carregarChecksSalvosContexto();
    });
  });

  const filtroModo = document.getElementById("filtroModo");
  if (filtroModo) {
    filtroModo.addEventListener("change", salvarSelectsLocais);
  }
}

function obterChaveContexto() {
  const ano = document.getElementById("selectAno") ? document.getElementById("selectAno").value : "Ano 1";
  const estacao = document.getElementById("selectEstacao") ? document.getElementById("selectEstacao").value : "Primavera";
  const semana = document.getElementById("selectSemana") ? document.getElementById("selectSemana").value : "Semana 1";
  return `stardew_checks_${ano}_${estacao}_${semana}`;
}

function salvarChecksLocal() {
  const estadoChecks = {};
  listaNPCs.forEach(npc => {
    const chk = document.getElementById(`chk_${npc}`);
    if (chk) estadoChecks[npc] = chk.checked;
  });
  localStorage.setItem(obterChaveContexto(), JSON.stringify(estadoChecks));
}

function carregarChecksSalvosContexto() {
  const salvo = localStorage.getItem(obterChaveContexto());
  const anoAtual = document.getElementById("selectAno") ? document.getElementById("selectAno").value : "";
  const estacaoAtual = document.getElementById("selectEstacao") ? document.getElementById("selectEstacao").value : "";
  const semanaAtual = document.getElementById("selectSemana") ? document.getElementById("selectSemana").value : "";
  const slotAtual = document.getElementById("selectSlot") ? document.getElementById("selectSlot").value : "";

  listaNPCs.forEach(npc => {
    const chk = document.getElementById(`chk_${npc}`);
    if (!chk || chk.disabled) return;

    if (salvo) {
      try {
        const estadoChecks = JSON.parse(salvo);
        if (estadoChecks[npc] !== undefined) {
          chk.checked = estadoChecks[npc];
        }
      } catch (e) {
        chk.checked = false;
      }
    } else {
      const jaTemSlot = historicoGlobal.some(r => 
        r.ano === anoAtual && r.estacao === estacaoAtual && r.semana === semanaAtual && r.npc === npc && r.slot === slotAtual
      );
      chk.checked = !jaTemSlot;
    }
  });
}

function atualizarBloqueioChecklist() {
  const anoAtual = document.getElementById("selectAno") ? document.getElementById("selectAno").value : "";
  const estacaoAtual = document.getElementById("selectEstacao") ? document.getElementById("selectEstacao").value : "";
  const semanaAtual = document.getElementById("selectSemana") ? document.getElementById("selectSemana").value : "";
  const slotAtual = document.getElementById("selectSlot") ? document.getElementById("selectSlot").value : "";

  listaNPCs.forEach(npc => {
    const chk = document.getElementById(`chk_${npc}`);
    const lbl = document.getElementById(`lbl_${npc}`);
    if (!chk || !lbl) return;

    const presentesNaSemana = historicoGlobal.filter(r => 
      r.ano === anoAtual && r.estacao === estacaoAtual && r.semana === semanaAtual && r.npc === npc
    );

    const jaTemSlotAtual = presentesNaSemana.some(r => r.slot === slotAtual);
    const totalPresentesSemana = presentesNaSemana.length;

    if (totalPresentesSemana >= 2) {
      chk.disabled = true;
      chk.checked = false;
      lbl.style.color = "#9ca3af";
      lbl.innerHTML = `${npc} <span style="font-size:5px; color:#b91c1c;">(Concluído 2/2)</span>`;
    } else if (jaTemSlotAtual) {
      chk.disabled = true;
      chk.checked = false;
      lbl.style.color = "#d97706";
      lbl.innerHTML = `${npc} <span style="font-size:5px; color:#d97706;">(Concluído 1/2)</span>`;
    } else {
      chk.disabled = false;
      lbl.style.color = "#5c2c16";
      if (totalPresentesSemana === 1) {
        lbl.innerHTML = `${npc} <span style="font-size:5px; color:#15803d;">(Concluído 1/2)</span>`;
      } else {
        lbl.textContent = npc;
      }
    }
  });

  carregarChecksSalvosContexto();
}

function toggleChecklist() {
  const wrapper = document.getElementById("checklistWrapper");
  if (wrapper) wrapper.classList.toggle("oculto");
}

function marcarTodos(marcar) {
  listaNPCs.forEach(npc => {
    const chk = document.getElementById(`chk_${npc}`);
    if (chk && !chk.disabled) chk.checked = marcar;
  });
  salvarChecksLocal();
}

function avancarContextoAutomaticamente() {
  const slotSelect = document.getElementById("selectSlot");
  const semanaSelect = document.getElementById("selectSemana");
  const estacaoSelect = document.getElementById("selectEstacao");
  const anoSelect = document.getElementById("selectAno");

  if (!slotSelect || !semanaSelect || !estacaoSelect || !anoSelect) return;

  if (slotSelect.value === "Presente 1") {
    slotSelect.value = "Presente 2";
  } else {
    slotSelect.value = "Presente 1";
    
    const semanas = ["Semana 1", "Semana 2", "Semana 3", "Semana 4"];
    let idxSemana = semanas.indexOf(semanaSelect.value);
    
    if (idxSemana < semanas.length - 1) {
      semanaSelect.value = semanas[idxSemana + 1];
    } else {
      semanaSelect.value = "Semana 1";
      
      const estacoes = ["Primavera", "Verão", "Outono", "Inverno"];
      let idxEstacao = estacoes.indexOf(estacaoSelect.value);
      
      if (idxEstacao < estacoes.length - 1) {
        estacaoSelect.value = estacoes[idxEstacao + 1];
      } else {
        estacaoSelect.value = "Primavera";
        
        let anoAtualNum = parseInt(anoSelect.value.replace("Ano ", "")) || 1;
        let proximoAnoStr = `Ano ${anoAtualNum + 1}`;
        
        let existe = Array.from(anoSelect.options).some(o => o.value === proximoAnoStr);
        if (!existe) {
          const opt = document.createElement("option");
          opt.value = proximoAnoStr;
          opt.textContent = proximoAnoStr;
          anoSelect.appendChild(opt);
        }
        anoSelect.value = proximoAnoStr;
      }
    }
  }
  salvarSelectsLocais();
}

async function salvarLote() {
  const ano = document.getElementById("selectAno").value;
  const estacao = document.getElementById("selectEstacao").value;
  const semana = document.getElementById("selectSemana").value;
  const slotSelect = document.getElementById("selectSlot");
  const slot = slotSelect.value;
  const itemUnico = document.getElementById("inputItemUnico").value.trim();
  const msg = document.getElementById("statusMsg");

  if (!itemUnico) {
    if (msg) {
      msg.style.color = "red";
      msg.textContent = "Digite o item da rodada!";
    }
    return;
  }

  const npcsSelecionados = [];
  listaNPCs.forEach(npc => {
    const chk = document.getElementById(`chk_${npc}`);
    if (chk && chk.checked && !chk.disabled) {
      npcsSelecionados.push(npc);
    }
  });

  if (npcsSelecionados.length === 0) {
    if (msg) {
      msg.style.color = "red";
      msg.textContent = "Selecione ao menos um NPC válido!";
    }
    return;
  }

  if (msg) {
    msg.style.color = "#722f10";
    msg.textContent = "Salvando na ordem da rota...";
  }

  const payload = {
    action: "salvarLote",
    ano: ano,
    estacao: estacao,
    semana: semana,
    slot: slot,
    itemUnico: itemUnico,
    npcsSelecionados: npcsSelecionados
  };

  try {
    await fetch(API_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (msg) {
      msg.style.color = "green";
      msg.textContent = "Salvo com sucesso!";
    }
    document.getElementById("inputItemUnico").value = "";

    avancarContextoAutomaticamente();

    const wrapper = document.getElementById("checklistWrapper");
    if (wrapper) wrapper.classList.add("oculto");

    setTimeout(async () => {
      if (msg) msg.textContent = "";
      await carregarHistorico();
    }, 1500);

  } catch (err) {
    if (msg) {
      msg.style.color = "red";
      msg.textContent = "Erro ao salvar.";
    }
  }
}

function atualizarSelectAnos(anosPlanilha) {
  const selectFiltro = document.getElementById("filtroAno");
  const selectTopo = document.getElementById("selectAno");
  if (!selectFiltro || !selectTopo) return;

  const valorAtualFiltro = selectFiltro.value;
  const valorAtualTopo = selectTopo.value;
  
  selectFiltro.innerHTML = '<option value="Todos">Todos</option>';
  if (!anosPlanilha || anosPlanilha.length === 0) anosPlanilha = ["Ano 1"];

  anosPlanilha.forEach(ano => {
    const optF = document.createElement("option");
    optF.value = ano;
    optF.textContent = ano;
    selectFiltro.appendChild(optF);

    if (!Array.from(selectTopo.options).some(o => o.value === ano)) {
      const optT = document.createElement("option");
      optT.value = ano;
      optT.textContent = ano;
      selectTopo.appendChild(optT);
    }
  });

  if (Array.from(selectFiltro.options).some(o => o.value === valorAtualFiltro)) {
    selectFiltro.value = valorAtualFiltro;
  }
  if (Array.from(selectTopo.options).some(o => o.value === valorAtualTopo)) {
    selectTopo.value = valorAtualTopo;
  }
}

function popularSelectFaltamRodadas() {
  const selectRodada = document.getElementById("selectFaltamRodada");
  if (!selectRodada) return;

  const valorAnterior = selectRodada.value;
  const rodadasMap = {};
  
  historicoGlobal.forEach(r => {
    const chave = `${r.ano}|${r.estacao}|${r.semana}|${r.slot}`;
    rodadasMap[chave] = r.item;
  });

  selectRodada.innerHTML = '<option value="">-- Escolha um item --</option>';

  Object.keys(rodadasMap).sort().forEach(chave => {
    const nomeItem = rodadasMap[chave];
    const opt = document.createElement("option");
    opt.value = chave;
    opt.textContent = nomeItem;
    selectRodada.appendChild(opt);
  });

  if (Array.from(selectRodada.options).some(o => o.value === valorAnterior)) {
    selectRodada.value = valorAnterior;
  }
}

function alternarModoExibicao() {
  const filtroModo = document.getElementById("filtroModo");
  const grupoSelectFaltam = document.getElementById("grupoSelectFaltam");
  if (!filtroModo || !grupoSelectFaltam) return;

  if (filtroModo.value === "faltam") {
    grupoSelectFaltam.style.display = "flex";
  } else {
    grupoSelectFaltam.style.display = "none";
  }
  salvarSelectsLocais();
  filtrarHistorico();
}

function filtrarHistorico() {
  const filtroAno = document.getElementById("filtroAno") ? document.getElementById("filtroAno").value : "Todos";
  const filtroEstacao = document.getElementById("filtroEstacao") ? document.getElementById("filtroEstacao").value : "Todas";
  const filtroSemana = document.getElementById("filtroSemana") ? document.getElementById("filtroSemana").value : "Todas";
  const filtroSlot = document.getElementById("filtroSlot") ? document.getElementById("filtroSlot").value : "Todos";
  const filtroModo = document.getElementById("filtroModo") ? document.getElementById("filtroModo").value : "historico";
  const container = document.getElementById("tabelaHistorico");

  if (!container) return;
  container.innerHTML = "";

  if (filtroModo === "faltam") {
    const selectRodada = document.getElementById("selectFaltamRodada");
    const chaveSelecionada = selectRodada ? selectRodada.value : "";
    
    if (!chaveSelecionada) {
      container.innerHTML = "<div style='font-size:7px; text-align:center; color:#b91c1c; padding:10px;'>Selecione um item no campo acima para ver quem falta receber!</div>";
      return;
    }

    const [anoSel, estacaoSel, semanaSel, slotSel] = chaveSelecionada.split("|");
    const jaReceberam = new Set();
    
    historicoGlobal.forEach(r => {
      if (r.ano === anoSel && r.estacao === estacaoSel && r.semana === semanaSel && r.slot === slotSel) {
        jaReceberam.add(r.npc);
      }
    });

    const faltam = listaNPCs.filter(npc => !jaReceberam.has(npc));

    if (faltam.length === 0) {
      container.innerHTML = `<div style='font-size:7px; text-align:center; color:#15803d; padding:10px;'>🎉 Todos os NPCs já receberam presente nesta rodada!</div>`;
      return;
    }

    const cabecalho = document.createElement("div");
    cabecalho.style.cssText = "font-size:7px; margin-bottom:6px; color:#722f10; font-weight:bold; border-bottom:1px solid #b15d26; padding-bottom:4px;";
    cabecalho.textContent = `Faltam ${faltam.length} NPC(s) nesta rodada:`;
    container.appendChild(cabecalho);

    faltam.forEach(npc => {
      const div = document.createElement("div");
      div.className = "registro-item";
      div.innerHTML = `
        <span><b>${npc}</b></span>
        <span style="color: #b91c1c;">❌ <b>Não recebeu ainda</b></span>
      `;
      container.appendChild(div);
    });

  } else {
    const filtrados = historicoGlobal.filter(r => {
      let matchAno = (filtroAno === "Todos" || r.ano === filtroAno);
      let matchEstacao = (filtroEstacao === "Todas" || r.estacao === filtroEstacao);
      let matchSemana = (filtroSemana === "Todas" || r.semana === filtroSemana);
      let matchSlot = (filtroSlot === "Todos" || r.slot === filtroSlot);
      return matchAno && matchEstacao && matchSemana && matchSlot;
    });

    if (filtrados.length === 0) {
      container.innerHTML = "<div style='font-size:7px; text-align:center; color:#777; padding:8px;'>Nenhum registro encontrado.</div>";
      return;
    }

    filtrados.forEach(reg => {
      const div = document.createElement("div");
      div.className = "registro-item";
      div.innerHTML = `
        <span><b>[${reg.ano} - ${reg.estacao} - ${reg.semana} | ${reg.slot}]</b> ${reg.npc}:</span>
        <span style="color: #2d5a27;">✓ <b>${reg.item}</b></span>
      `;
      container.appendChild(div);
    });
  }
}

// CONTROLE DE ABAS E CONQUISTAS
function mudarAba(nomeAba, evento) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

  document.getElementById(`aba-${nomeAba}`).classList.add('active');
  if (evento && evento.target) {
    evento.target.classList.add('active');
  }
}

const culturasPolicultura = [
  "Chirívia", "Couve", "Alho", "Batata", "Couve-flor", "Vagem", "Morango", 
  "Rabanete", "Melão", "Tomate", "Mirtilo", "Milho", "Pimentão", "Berinjela", "Abóbora"
];

const itensEnvioCompleto = [
  "Rábano Silvestre", "Narciso", "Alho-poró", "Dente-de-leão", "Chirívia", "Cenoura", "Abobrinha", "Brócolis", "Melão em Pó", "Cenoura da Caverna",
  "Coco", "Fruta de Cacto", "Banana", "Manga", "Raiz-forte", "Inhame Taro", "Abacaxi", "Seiva", "Madeira", "Pedra",
  "Argila", "Minério de Cobre", "Minério de Ferro", "Minério de Ouro", "Minério de Iridium", "Carvão", "Barra de Cobre", "Barra de Ferro", "Barra de Ouro", "Barra de Iridium",
  "Quartzo Refinado", "Pilha", "Concha Náutica", "Coral", "Concha Arco-Íris", "Fruta de Espinho", "Ouriço-do-mar", "Uva", "Cebolinha", "Morango",
  "Vagem", "Couve-flor", "Batata", "Alho", "Ervilha de Cheiro", "Cogumelo Comum", "Ameixa Selvagem", "Avelã", "Amora-silvestre", "Raiz de Inverno",
  "Fruta Cristal", "Inhame de Neve", "Baga de Gema Doce", "Açafrão", "Azevinho", "Cogumelo Vermelho", "Girassol", "Cogumelo Roxo", "Queijo", "Queijo de Cabra",
  "Tecido", "Trufa", "Óleo de Trufa", "Grão de Café", "Leite de Cabra", "Leite de Cabra Grande", "Lã", "Ovo de Pato", "Pena de Pato", "Caviar",
  "Pé de Coelho", "Ovo de Avestruz", "Fruta Antiga", "Hidromel", "Tulipa", "Spangle de Verão", "Rosa de Fada", "Blue Jazz", "Maçã", "Chá Verde",
  "Damasco", "Laranja", "Pêssego", "Romã", "Cereja", "Amaranto", "Artichoke", "Beterraba", "Bok Choy", "Couve",
  "Cranberries", "Berinjela", "Uva (Outono)", "Milho", "Lúpulo", "Melão", "Pimenta Quente", "Abóbora", "Rabanete", "Repolho Roxo",
  "Ruibarbo", "Carambola", "Tomate", "Trigo", "Inhame", "Ovo Branco", "Ovo Grande Branco", "Ovo Marrom", "Ovo Grande Marrom", "Leite",
  "Leite Grande", "Maionese", "Maionese de Pato", "Maionese Vazia", "Maionese de Dinossauro", "Mel", "Geleia", "Cerveja", "Vinho", "Suco",
  "Picles", "Pale Ale", "Ovo Vazio", "Papoula", "Carne de Inseto", "Madeira de Lei", "Xarope de Bordo", "Resina de Carvalho", "Piche de Pinheiro", "Gosma",
  "Asa de Morcego", "Essência Solar", "Essência do Vazio", "Fibra", "Tinta de Lula", "Folhas de Chá", "Gengibre", "Fragmento de Cinza", "Cogumelo Magma", "Fragmento de Osso",
  "Minério Radioativo", "Barra Radioativa", "Peixe Defumado", "Musgo", "Xarope Místico", "Passas", "Fruta Desidratada", "Cogumelo Dessecado"
];

function inicializarConquistas() {
  const containerPoli = document.getElementById("checklistPolicultura");
  if (containerPoli) {
    containerPoli.innerHTML = "";
    culturasPolicultura.forEach(cultura => {
      const div = document.createElement("div");
      div.className = "checklist-item";
      div.innerHTML = `
        <input type="checkbox" id="poli_${cultura}" onchange="salvarCulturasPlanilha()">
        <label for="poli_${cultura}">${cultura} (15x)</label>
      `;
      containerPoli.appendChild(div);
    });
  }

  const containerEnvio = document.getElementById("checklistEnvio");
  if (containerEnvio) {
    containerEnvio.innerHTML = "";
    itensEnvioCompleto.forEach((item, index) => {
      const div = document.createElement("div");
      div.className = "checklist-item";
      div.innerHTML = `
        <input type="checkbox" id="envio_${index}" onchange="salvarEnvioPlanilha()">
        <label for="envio_${index}">${item}</label>
      `;
      containerEnvio.appendChild(div);
    });
  }
}

async function carregarConquistasPlanilha() {
  try {
    const res = await fetch(`${API_URL}?action=getConquistas`);
    const dados = await res.json();
    
    if (dados.culturas) {
      dados.culturas.forEach(r => {
        if (r[0] === "Monocultura") {
          if (document.getElementById("inputMonoculturaItem")) document.getElementById("inputMonoculturaItem").value = r[1] || "";
          if (document.getElementById("inputMonoculturaQtd")) document.getElementById("inputMonoculturaQtd").value = r[2] || 0;
        } else if (r[0] === "Policultura") {
          const chk = document.getElementById(`poli_${r[1]}`);
          if (chk) chk.checked = (r[4] === "Concluído" || r[2] >= 15);
        }
      });
      atualizarProgressoCulturas();
    }
    
    if (dados.envio) {
      dados.envio.forEach((r, idx) => {
        const chk = document.getElementById(`envio_${idx}`);
        if (chk) chk.checked = (r[2] === "Sim");
      });
      atualizarProgressoEnvio();
    }
  } catch (err) {
    console.error("Erro ao carregar conquistas da planilha:", err);
  }
}

function atualizarProgressoCulturas() {
  const qtdInput = document.getElementById("inputMonoculturaQtd");
  const qtd = qtdInput ? parseInt(qtdInput.value) || 0 : 0;
  
  const barraMono = document.getElementById("barraMonocultura");
  const textoMono = document.getElementById("textoMonocultura");
  const porcMono = Math.min((qtd / 300) * 100, 100);
  
  if (barraMono) barraMono.style.width = `${porcMono}%`;
  if (textoMono) textoMono.textContent = `${qtd} / 300`;

  let concluidas = 0;
  culturasPolicultura.forEach(cultura => {
    const chk = document.getElementById(`poli_${cultura}`);
    if (chk && chk.checked) concluidas++;
  });

  const barraPoli = document.getElementById("barraPolicultura");
  const textoPoli = document.getElementById("textoPolicultura");
  const porcPoli = (concluidas / culturasPolicultura.length) * 100;

  if (barraPoli) barraPoli.style.width = `${porcPoli}%`;
  if (textoPoli) textoPoli.textContent = `${concluidas} / ${culturasPolicultura.length} Culturas`;
}

function atualizarProgressoEnvio() {
  let concluidas = 0;
  itensEnvioCompleto.forEach((_, index) => {
    const chk = document.getElementById(`envio_${index}`);
    if (chk && chk.checked) concluidas++;
  });

  const barraEnvio = document.getElementById("barraEnvio");
  const textoEnvio = document.getElementById("textoEnvio");
  const porcEnvio = (concluidas / itensEnvioCompleto.length) * 100;

  if (barraEnvio) barraEnvio.style.width = `${porcEnvio}%`;
  if (textoEnvio) textoEnvio.textContent = `${concluidas} / ${itensEnvioCompleto.length} Itens`;
}

async function salvarCulturasPlanilha() {
  atualizarProgressoCulturas();
  const monoItem = document.getElementById("inputMonoculturaItem")?.value || "Chirívia";
  const monoQtd = parseInt(document.getElementById("inputMonoculturaQtd")?.value) || 0;
  
  const poliStatus = {};
  culturasPolicultura.forEach(c => {
    const chk = document.getElementById(`poli_${c}`);
    poliStatus[c] = chk ? chk.checked : false;
  });

  const payload = {
    action: "salvarCulturas",
    monoItem: monoItem,
    monoQtd: monoQtd,
    poliStatus: poliStatus
  };

  try {
    await fetch(API_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.error("Erro ao salvar culturas na planilha:", e);
  }
}

async function salvarEnvioPlanilha() {
  atualizarProgressoEnvio();
  const envioStatus = {};
  itensEnvioCompleto.forEach((_, index) => {
    const chk = document.getElementById(`envio_${index}`);
    envioStatus[index] = chk ? chk.checked : false;
  });

  const payload = {
    action: "salvarEnvio",
    envioStatus: envioStatus
  };

  try {
    await fetch(API_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.error("Erro ao salvar envio na planilha:", e);
  }
}

function marcarTodosEnvio(marcar) {
  itensEnvioCompleto.forEach((_, index) => {
    const chk = document.getElementById(`envio_${index}`);
    if (chk) chk.checked = marcar;
  });
  salvarEnvioPlanilha();
}

inicializar(); 