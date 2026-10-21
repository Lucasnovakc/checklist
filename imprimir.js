// Impressão (aba do Cadastro, só gerente): lista simples ou grade do mês, de um setor inteiro ou de um funcionário.
// A folha é montada em #impressao e só ela aparece no papel (ver "impressão" no style.css).
(function () {
  const R = window.Regras;
  const esc = s => App.esc(s);
  const escolha = { tipo: 'setor', setor: null, pessoa: null, formato: 'lista', mes: null };
  const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
  const setoresAtivos = () => App.estado.setores.filter(s => s.ativo).sort((a, b) => a.ordem - b.ordem || porNome(a, b));
  const pessoasComSetor = () => App.estado.pessoas.filter(p => p.ativo && p.setor_id).sort(porNome);
  const nomeSetor = id => (App.estado.setores.find(s => s.id === id) || { nome: '' }).nome;

  // ---- aba ----
  function aba() {
    const setores = setoresAtivos(), pessoas = pessoasComSetor();
    if (!escolha.mes) escolha.mes = App.estado.dia.slice(0, 7);
    if (!setores.some(s => s.id === escolha.setor)) escolha.setor = setores[0] ? setores[0].id : null;
    if (!pessoas.some(p => p.id === escolha.pessoa)) escolha.pessoa = pessoas[0] ? pessoas[0].id : null;
    const radio = (nome, valor, rotulo, atual) =>
      `<label class="opcao"><input type="radio" name="${nome}" value="${valor}" ${atual === valor ? 'checked' : ''}><span>${rotulo}</span></label>`;
    const opcoes = (lista, atual) => lista.map(x => `<option value="${esc(x.id)}" ${x.id === atual ? 'selected' : ''}>${esc(x.nome)}</option>`).join('');
    return `<div class="painel imprimir">
      <fieldset class="campo"><legend>O que imprimir</legend><div class="opcoes">
        ${radio('imp-tipo', 'setor', 'Um setor inteiro', escolha.tipo)}${radio('imp-tipo', 'pessoa', 'Um funcionário', escolha.tipo)}</div></fieldset>
      <label class="campo" id="imp-setor-campo" ${escolha.tipo === 'setor' ? '' : 'hidden'}><span>Setor</span><select id="imp-setor">${opcoes(setores, escolha.setor)}</select></label>
      <label class="campo" id="imp-pessoa-campo" ${escolha.tipo === 'pessoa' ? '' : 'hidden'}><span>Funcionário</span><select id="imp-pessoa">${opcoes(pessoas, escolha.pessoa)}</select></label>
      <fieldset class="campo"><legend>Formato</legend><div class="opcoes">
        ${radio('imp-formato', 'lista', 'Lista simples', escolha.formato)}${radio('imp-formato', 'grade', 'Grade do mês', escolha.formato)}</div></fieldset>
      <label class="campo" id="imp-mes-campo" ${escolha.formato === 'grade' ? '' : 'hidden'}><span>Mês</span><input type="month" id="imp-mes" value="${esc(escolha.mes)}"></label>
      <button type="button" class="btn primario" data-acao="imprimir">Imprimir</button>
      <p class="ajuda">Abre a janela de impressão do navegador. Para guardar em PDF, escolha "Salvar como PDF" no lugar da impressora.</p>
    </div>`;
  }

  function ler() {
    const v = s => document.querySelector(s);
    escolha.tipo = v('[name=imp-tipo]:checked').value;
    escolha.formato = v('[name=imp-formato]:checked').value;
    escolha.setor = v('#imp-setor').value || null;
    escolha.pessoa = v('#imp-pessoa').value || null;
    escolha.mes = v('#imp-mes').value || App.estado.dia.slice(0, 7);
    v('#imp-setor-campo').hidden = escolha.tipo !== 'setor';
    v('#imp-pessoa-campo').hidden = escolha.tipo !== 'pessoa';
    v('#imp-mes-campo').hidden = escolha.formato !== 'grade';
  }

  // ---- folha ----
  const nomesQuem = ids => ids.map(App.pessoa).filter(p => p && p.ativo).map(p => R.primeiroNome(p.nome)).join(', ') || 'ninguém';
  function textoTarefa(t) {
    const hora = t.horario ? `<span class="hora-folha">${R.hhmm(t.horario)}</span> ` : '';
    const freq = t.frequencia !== 'diaria' ? ` <small>(${esc(R.descreverFrequencia(t))})</small>` : '';
    return hora + esc(t.titulo) + freq;
  }
  function cabecalho(linhas) {
    return `<header class="folha-topo"><div class="folha-marca">BARÃO BAR</div>
      <div><h1>Checklist operacional</h1><p>${linhas.map(esc).join(' &nbsp;|&nbsp; ')}</p></div></header>`;
  }
  const rodape = () => '<footer class="folha-rodape"><span>Responsável: ______________________________</span><span>Data: ____/____/______</span></footer>';
  const vazio = c => (c.tarefas.length ? '' : '<p>Nenhuma tarefa cadastrada.</p>');

  function contexto(cad) {
    if (escolha.tipo === 'setor') {
      if (!escolha.setor) return null;
      return { linhas: ['Setor: ' + nomeSetor(escolha.setor)], mostrarQuem: true,
        tarefas: R.tarefasParaImprimir(cad.tarefas, cad.tarefaPessoas, { setor: escolha.setor }) };
    }
    const p = App.pessoa(escolha.pessoa);
    if (!p) return null;
    return { linhas: ['Funcionário: ' + p.nome, 'Setor: ' + nomeSetor(p.setor_id)], mostrarQuem: false,
      tarefas: R.tarefasParaImprimir(cad.tarefas, cad.tarefaPessoas, { pessoa: p.id }) };
  }

  function folhaLista(c) {
    const bloco = (titulo, lista) => (lista.length ? `<h2>${titulo}</h2><table class="tabela-folha">${lista.map(t => `<tr class="item-folha">
      <td class="caixa"></td><td class="tarefa-folha">${textoTarefa(t)}</td>${c.mostrarQuem ? `<td class="quem-folha">${esc(nomesQuem(t.quem))}</td>` : ''}</tr>`).join('')}</table>` : '');
    return `<section class="folha folha-lista">${cabecalho(c.linhas)}
      ${bloco('Diárias', c.tarefas.filter(R.ehDoDia))}${bloco('Da semana / quinzena', c.tarefas.filter(t => !R.ehDoDia(t)))}
      ${vazio(c)}${rodape()}</section>`;
  }

  function folhaGrade(c, ano, mes) {
    const abertos = App.estado.diasAbertos;
    const dias = R.diasDoMes(ano, mes);
    const n = d => Number(d.slice(8));
    const quem = t => (c.mostrarQuem ? `<small class="quem-grade">${esc(nomesQuem(t.quem))}</small>` : '');
    const linha = (t, celulas) => `<tr data-tarefa="${esc(t.id)}"><td class="tarefa-grade">${textoTarefa(t)}${quem(t)}</td>${celulas}</tr>`;
    const diarias = c.tarefas.filter(R.ehDoDia);
    const tabDias = diarias.length ? `<table class="grade grade-dias"><thead><tr><th class="tarefa-grade">Atividades diárias</th>
      ${dias.map(d => `<th class="dia${abertos.includes(R.diaDaSemana(d)) ? '' : ' fechado'}">${n(d)}<small>${R.SEMANA_CURTA[R.diaDaSemana(d)][0]}</small></th>`).join('')}</tr></thead>
      <tbody>${diarias.map(t => linha(t, dias.map(d => `<td class="${R.celulaGrade(t, d, abertos)}"></td>`).join(''))).join('')}</tbody></table>` : '';
    const tabPeriodo = (titulo, lista, colunas, classe, th) => (lista.length ? `<table class="grade grade-${classe}"><thead><tr><th class="tarefa-grade">${titulo}</th>
      ${colunas.map(([rot, sub]) => `<th class="${th}">${rot}<small>${sub}</small></th>`).join('')}</tr></thead>
      <tbody>${lista.map(t => linha(t, colunas.map(() => '<td class="marcar"></td>').join(''))).join('')}</tbody></table>` : '');
    const semanas = R.semanasDoMes(ano, mes).map((s, i) => [`Semana ${i + 1}`, `${n(s.inicio)} a ${n(s.fim)}`]);
    const quinzenas = [['Quinzena 1', '1 a 15'], ['Quinzena 2', `16 a ${n(dias[dias.length - 1])}`]];
    const nomeMes = R.nomeDoMes(ano, mes);
    return `<section class="folha folha-grade">${cabecalho([...c.linhas, 'Mês: ' + nomeMes[0].toUpperCase() + nomeMes.slice(1)])}
      ${tabDias}
      ${tabPeriodo('Atividades semanais', c.tarefas.filter(t => t.frequencia === 'semanal'), semanas, 'semanas', 'semana')}
      ${tabPeriodo('Atividades quinzenais', c.tarefas.filter(t => t.frequencia === 'quinzenal'), quinzenas, 'quinzenas', 'quinzena')}
      ${vazio(c)}${rodape()}</section>`;
  }

  function imprimir() {
    ler();
    const c = contexto(Cadastro.dados());
    if (!c) { App.toast('Escolha o setor ou o funcionário.', 'erro'); return; }
    let folha = document.getElementById('impressao');
    if (!folha) { folha = document.createElement('div'); folha.id = 'impressao'; document.body.appendChild(folha); }
    let pagina = document.getElementById('pagina-impressao');
    if (!pagina) { pagina = document.createElement('style'); pagina.id = 'pagina-impressao'; document.head.appendChild(pagina); }
    const grade = escolha.formato === 'grade';
    const [ano, mes] = escolha.mes.split('-').map(Number);
    folha.innerHTML = grade ? folhaGrade(c, ano, mes) : folhaLista(c);
    pagina.textContent = `@page { size: A4 ${grade ? 'landscape' : 'portrait'}; margin: 10mm; }`;
    window.print();
  }

  document.addEventListener('change', ev => {
    if (ev.target.closest('.tela-cadastro .imprimir')) ler();
  });
  document.addEventListener('click', ev => {
    if (ev.target.closest('.tela-cadastro [data-acao=imprimir]')) { try { imprimir(); } catch (err) { App.erro(err); } }
  });

  window.Imprimir = { aba };
})();
