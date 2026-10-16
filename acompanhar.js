// Tela "Acompanhar" (líder e gerente): progresso de cada pessoa, liberar tarefa, fechar/reabrir dia e validar o setor.
(function () {
  const R = window.Regras;
  const esc = s => App.esc(s);
  let filtro = 'todos'; // setor escolhido (só gerente)
  let aberta = null;    // pessoa com a lista aberta
  const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');

  function setoresVisiveis() {
    const e = App.estado;
    const ativos = e.setores.filter(s => s.ativo).sort((a, b) => a.ordem - b.ordem || porNome(a, b));
    if (!App.souGerente()) return ativos.filter(s => s.id === e.eu.setor_id);
    return filtro === 'todos' ? ativos : ativos.filter(s => s.id === filtro);
  }

  function cabecaSetor(s) {
    const sit = R.situacaoSetor(s.id, App.estado);
    let lado;
    if (sit.tipo === 'validado') lado = `<span class="selo-ok">Validado por ${esc(R.primeiroNome(sit.validacao.validado_por_nome))} às ${R.formatarHora(sit.validacao.validado_em)}</span>`;
    else if (sit.tipo === 'aguardando') lado = `<span class="selo-espera">Aguardando ${sit.faltam} ${sit.faltam === 1 ? 'fechamento' : 'fechamentos'}</span>`;
    else if (App.podeValidar(s.id)) lado = `<button type="button" class="btn primario" data-acao="validar" data-setor="${esc(s.id)}">Validar setor</button>`;
    else lado = '<span class="selo-espera">Pronto para validar</span>';
    const obs = sit.tipo === 'validado' && sit.validacao.observacao ? `<p class="obs">“${esc(sit.validacao.observacao)}”</p>` : '';
    return `<header class="setor-cabeca"><h2>${esc(s.nome)}</h2> ${lado}</header>${obs}`;
  }

  function acoesItem(i) {
    if (App.fechamentoDe(i.pessoa_id) || !App.podeLiberarDe(i.pessoa_id)) return '';
    if (i.estado === 'pendente') return '<div class="item-acoes"><button type="button" class="btn mini" data-acao="liberar">Liberar</button></div>';
    if (i.estado === 'liberado') return '<div class="item-acoes"><button type="button" class="btn mini" data-acao="desfazer-liberacao">Desfazer liberação</button></div>';
    return '';
  }

  function detalhe(p) {
    const e = App.estado;
    const itens = App.itensDe(p.id);
    const f = App.fechamentoDe(p.id);
    const gerente = App.souGerente();
    const faltam = R.faltamParaFechar(itens, e.dia, e.diasAbertos);
    const nome = esc(R.primeiroNome(p.nome));
    let rodape = '';
    if (gerente && f) rodape = `<button type="button" class="btn" data-acao="reabrir" data-pessoa-id="${esc(p.id)}">Reabrir o dia de ${nome}</button>`;
    else if (gerente && itens.length) {
      const texto = faltam === 0 ? `Fechar o dia de ${nome}` : faltam === 1 ? 'Falta 1 tarefa para fechar' : `Faltam ${faltam} tarefas para fechar`;
      rodape = `<button type="button" class="btn primario" data-acao="fechar-por" data-pessoa-id="${esc(p.id)}" ${faltam ? 'disabled' : ''}>${texto}</button>`;
    }
    const lista = itens.length
      ? `<ul class="itens">${itens.map(i => Hoje.linhaItem(i, { dia: e.dia, agora: App.agora(), clicavel: gerente && !f, acoes: acoesItem(i) })).join('')}</ul>`
      : '<p class="vazio">Sem tarefas hoje.</p>';
    return `<div class="detalhe" data-detalhe="${esc(p.id)}">${lista}${rodape ? `<div class="detalhe-rodape">${rodape}</div>` : ''}</div>`;
  }

  function cartaoPessoa(p) {
    const e = App.estado;
    const itens = App.itensDe(p.id);
    const pr = R.progresso(itens);
    const concluidas = pr.feitos + pr.liberados;
    const atrasadas = itens.filter(i => R.atrasado(i, e.dia, App.agora())).length;
    const f = App.fechamentoDe(p.id);
    const pct = pr.total ? Math.round(concluidas * 100 / pr.total) : 0;
    return `<button type="button" class="cartao-pessoa${aberta === p.id ? ' aberto' : ''}" data-pessoa="${esc(p.id)}" aria-expanded="${aberta === p.id}">
      <span class="cp-nome">${esc(p.nome)}${p.lider ? ' <small class="selo">líder</small>' : ''}</span>
      <span class="cp-situacao ${f ? 'fechado' : 'aberto'}">${f ? 'fechado ' + R.formatarHora(f.fechado_em) : 'aberto'}</span>
      <span class="cp-progresso"><span class="progresso"><span class="progresso-barra" style="width:${pct}%"></span></span><b>${concluidas}/${pr.total}</b></span>
      ${atrasadas ? `<span class="cp-atraso">${atrasadas} ${atrasadas === 1 ? 'atrasada' : 'atrasadas'}</span>` : ''}
    </button>${aberta === p.id ? detalhe(p) : ''}`;
  }

  async function desenhar(tela) {
    const e = App.estado;
    const ativos = e.setores.filter(s => s.ativo);
    if (filtro !== 'todos' && !ativos.some(s => s.id === filtro)) filtro = 'todos';
    const filtros = App.souGerente() && ativos.length > 1
      ? `<div class="filtros">${[['todos', 'Todos'], ...ativos.map(s => [s.id, s.nome])].map(([id, nome]) =>
          `<button type="button" class="chip${filtro === id ? ' ativo' : ''}" data-filtro="${esc(id)}">${esc(nome)}</button>`).join('')}</div>`
      : '';
    const secoes = setoresVisiveis().map(s => {
      const pessoas = e.pessoas.filter(p => p.ativo && p.setor_id === s.id).sort(porNome);
      return `<section class="setor" data-setor-secao="${esc(s.id)}">${cabecaSetor(s)}
        <div class="cartoes">${pessoas.length ? pessoas.map(cartaoPessoa).join('') : '<p class="vazio">Ninguém neste setor.</p>'}</div></section>`;
    }).join('');
    tela.innerHTML = `<section class="tela-acompanhar">
      <header class="cabeca-dia"><p class="sobre">${esc(R.formatarDiaLongo(e.dia))}</p><h1>Acompanhar</h1></header>
      ${filtros}${secoes || '<p class="vazio-grande">Nenhum setor cadastrado ainda.</p>'}
    </section>`;
  }

  async function agir(b) {
    const li = b.closest('[data-item]');
    const item = li && App.estado.itens.find(i => i.id === li.dataset.item);
    const p = b.dataset.pessoaId && App.pessoa(b.dataset.pessoaId);
    switch (b.dataset.acao) {
      case 'alternar':
        if (item && App.souGerente() && !App.fechamentoDe(item.pessoa_id)) await App.marcar(item.id, item.estado !== 'feito');
        break;
      case 'liberar': {
        const motivo = await App.perguntar(`Liberar "${item.titulo}"`, { obrigatorio: true, placeholder: 'Motivo (ex.: acabou o sabonete)', botao: 'Liberar' });
        if (motivo) await App.liberar(item.id, motivo);
        break;
      }
      case 'desfazer-liberacao':
        await App.desfazerLiberacao(item.id);
        break;
      case 'fechar-por':
        if (await App.escolher(`Fechar o dia de ${p.nome}? Fica registrado que foi você.`, [['sim', 'Fechar o dia', 'primario'], ['', 'Cancelar']]) === 'sim') await App.fecharDia(p.id);
        break;
      case 'reabrir':
        if (await App.escolher(`Reabrir o dia de ${p.nome}? A validação do setor de hoje também é desfeita.`, [['sim', 'Reabrir', 'primario'], ['', 'Cancelar']]) === 'sim') await App.reabrirDia(p.id);
        break;
      case 'validar': {
        const s = App.estado.setores.find(x => x.id === b.dataset.setor);
        const obs = await App.perguntar(`Validar ${s.nome}`, { placeholder: 'Observação (opcional)', botao: 'Validar setor' });
        if (obs !== null) await App.validarSetor(s.id, obs);
        break;
      }
    }
  }

  document.addEventListener('click', ev => {
    const t = ev.target;
    const f = t.closest('.tela-acompanhar [data-filtro]');
    if (f) { filtro = f.dataset.filtro; App.redesenhar().catch(App.erro); return; }
    const acao = t.closest('.tela-acompanhar [data-acao]');
    if (acao) { if (!acao.disabled) agir(acao).catch(App.erro); return; }
    const c = t.closest('.tela-acompanhar [data-pessoa]');
    if (c) { aberta = aberta === c.dataset.pessoa ? null : c.dataset.pessoa; App.redesenhar().catch(App.erro); }
  });

  App.registrarTela('acompanhar', desenhar);
})();
