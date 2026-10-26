function doGet(e) {
  var action = e.parameter.action;
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  if (action == "getNPCs") {
    var sheet = ss.getSheetByName("NPCs_Status");
    var data = sheet.getDataRange().getValues();
    var npcs = [];
    for (var i = 1; i < data.length; i++) {
      if (data[i][0]) npcs.push(data[i][0]);
    }
    return ContentService.createTextOutput(JSON.stringify(npcs)).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action == "getItens") {
    var sheet = ss.getSheetByName("Itens");
    var data = sheet.getDataRange().getValues();
    var itens = [];
    for (var i = 1; i < data.length; i++) {
      if (data[i][1]) itens.push(data[i][1]);
    }
    return ContentService.createTextOutput(JSON.stringify(itens)).setMimeType(ContentService.MimeType.JSON);
  }
  
  if (action == "getRegistros") {
    var sheet = ss.getSheetByName("Registros");
    var data = sheet.getDataRange().getValues();
    var resultado = [];
    var anosSet = {};
    
    for (var i = 1; i < data.length; i++) {
      if (data[i][0]) {
        anosSet[data[i][0]] = true;
        resultado.push({
          ano: data[i][0],
          estacao: data[i][1],
          semana: data[i][2],
          npc: data[i][3],
          slot: data[i][4],
          item: data[i][5]
        });
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({
      registros: resultado,
      anos: Object.keys(anosSet)
    })).setMimeType(ContentService.MimeType.JSON);
  }

  // NOVO: Buscar Conquistas
  if (action == "getConquistas") {
    var sheetCulturas = ss.getSheetByName("Conquistas_Culturas");
    var sheetEnvio = ss.getSheetByName("Conquistas_Envio");
    
    var culturasData = sheetCulturas ? sheetCulturas.getRange(2, 1, Math.max(sheetCulturas.getLastRow() - 1, 1), 5).getValues() : [];
    var envioData = sheetEnvio ? sheetEnvio.getRange(2, 1, Math.max(sheetEnvio.getLastRow() - 1, 1), 3).getValues() : [];
    
    return ContentService.createTextOutput(JSON.stringify({
      culturas: culturasData,
      envio: envioData
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var params = JSON.parse(e.postData.contents);
  
  if (params.action == "salvarLote") {
    var sheet = ss.getSheetByName("Registros");
    var data = sheet.getDataRange().getValues();
    var ano = params.ano;
    var estacao = params.estacao;
    var semana = params.semana;
    var slot = params.slot;
    var itemUnico = params.itemUnico;
    var npcsSelecionados = params.npcsSelecionados; 
    
    var registrosExistentes = {};
    for (var i = 1; i < data.length; i++) {
      if (data[i][0]) {
        var chave = data[i][0] + "|" + data[i][1] + "|" + data[i][2] + "|" + data[i][4] + "|" + data[i][3];
        registrosExistentes[chave] = i + 1;
      }
    }
    
    npcsSelecionados.forEach(function(npc) {
      var chaveBusca = ano + "|" + estacao + "|" + semana + "|" + slot + "|" + npc;
      if (registrosExistentes[chaveBusca]) {
        var linha = registrosExistentes[chaveBusca];
        sheet.getRange(linha, 6).setValue(itemUnico);
      } else {
        sheet.appendRow([ano, estacao, semana, npc, slot, itemUnico]);
      }
    });
    
    formatarPlanilhaRegistros(sheet);
    return ContentService.createTextOutput(JSON.stringify({status: "sucesso"})).setMimeType(ContentService.MimeType.JSON);
  }

  // NOVO: Salvar Monocultura e Policultura
  if (params.action == "salvarCulturas") {
    var sheetCulturas = ss.getSheetByName("Conquistas_Culturas");
    if (!sheetCulturas) return ContentService.createTextOutput(JSON.stringify({status: "erro"})).setMimeType(ContentService.MimeType.JSON);
    
    var rows = sheetCulturas.getDataRange().getValues();
    
    // Atualiza Monocultura (Linha 2)
    sheetCulturas.getRange(2, 2).setValue(params.monoItem);
    sheetCulturas.getRange(2, 3).setValue(params.monoQtd);
    sheetCulturas.getRange(2, 5).setValue(params.monoQtd >= 300 ? "Concluído" : "Em Progresso");
    
    // Atualiza Policultura
    for (var k = 1; k < rows.length; k++) {
      if (rows[k][0] == "Policultura") {
        var itemNome = rows[k][1];
        if (params.poliStatus && params.poliStatus[itemNome] !== undefined) {
          var ehConcluido = params.poliStatus[itemNome];
          sheetCulturas.getRange(k + 1, 3).setValue(ehConcluido ? 15 : 0);
          sheetCulturas.getRange(k + 1, 5).setValue(ehConcluido ? "Concluído" : "Pendente");
        }
      }
    }
    return ContentService.createTextOutput(JSON.stringify({status: "sucesso"})).setMimeType(ContentService.MimeType.JSON);
  }

  // NOVO: Salvar Envio Completo
  if (params.action == "salvarEnvio") {
    var sheetEnvio = ss.getSheetByName("Conquistas_Envio");
    if (!sheetEnvio) return ContentService.createTextOutput(JSON.stringify({status: "erro"})).setMimeType(ContentService.MimeType.JSON);
    
    if (params.envioStatus) {
      for (var idx in params.envioStatus) {
        var rowNum = parseInt(idx) + 2;
        sheetEnvio.getRange(rowNum, 3).setValue(params.envioStatus[idx] ? "Sim" : "Não");
      }
    }
    return ContentService.createTextOutput(JSON.stringify({status: "sucesso"})).setMimeType(ContentService.MimeType.JSON);
  }
}

function formatarPlanilhaRegistros(sheet) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 1) return;
  
  for (var i = 1; i <= 6; i++) {
    sheet.autoResizeColumn(i);
  }
}