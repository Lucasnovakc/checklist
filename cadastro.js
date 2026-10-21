// Tela "Cadastro" (só gerente): setores e suas tarefas com o direcionamento, equipe e dias de funcionamento.
(function () {
  const R = window.Regras;
  const esc = s => App.esc(s);
  let aba = 'tarefas';
  let setorSel = null;
  let cad = { tarefas: [], tarefaPessoas: [] };
  const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
  const formulario = () => document.getElementById('formulario');

  const setoresOrdenados = () => App.estado.setores.slice().sort((a, b) => (b.ativo - a.ativo) || a.ordem - b.ordem || porNome(a, b));
  const pessoasDoSetor = id => App.estado.pessoas.filter(p => p.ativo && p.setor_id === id).sort(porNome);
  const tarefasDoSetor = id => cad.tarefas.filter(t => t.setor_id === id && t.ativo).sort((a, b) => a.ordem - b.ordem);
  const direcionados = tid => cad.tarefaPessoas.filter(tp => tp.tarefa_id === tid).map(tp => tp.pessoa_id);
  const proximaOrdem = id => tarefasDoSetor(id).reduce((m, t) => Math.max(m, t.ordem + 1), 0);
  const nomeSetor = id => (App.estado.setores.find(s => s.id === id) || { nome: 'Sem setor' }).nome;

  // ---- abas ----
  function linhaTarefa(t, n, total) {
    const quem = direcionados(t.id).map(App.pessoa).filter(p => p && p.ativo).map(p => esc(R.primeiroNome(p.nome)));
    return `<li class="tarefa" data-tarefa="${esc(t.id)}">
      <div class="tarefa-corpo"><b>${t.horario ? `<span class="hora">${R.hhmm(t.horario)}</span>` : ''}${esc(t.titulo)}</b>
        <small>${esc(R.descreverFrequencia(t))} · ${quem.length ? quem.join(', ') : '<span class="falta">ninguém recebeu</span>'}</small></div>
      <div class="tarefa-botoes">
        <button type="button" class="btn-icone" data-acao="subir" ${n === 0 ? 'disabled' : ''} aria-label="Subir">↑</button>
        <button type="button" class="btn-icone" data-acao="descer" ${n === total - 1 ? 'disabled' : ''} aria-label="Descer">↓</button>
        <button type="button" class="btn mini" data-acao="editar-tarefa">Editar</button>
      </div>
    </li>`;
  }
  function abaTarefas() {
    const setores = setoresOrdenados();
    if (!setores.length) return `<div class="vazio-grande"><p>Comece criando um setor (ex.: Garçons, Cozinha, Caixa).</p>
      <button type="button" class="btn primario" data-acao="novo-setor">+ Novo setor</button></div>`;
    if (!setores.some(s => s.id === setorSel)) setorSel = setores[0].id;
    const s = setores.find(x => x.id === setorSel);
    const tarefas = tarefasDoSetor(s.id);
    return `<div class="setores-lista">${setores.map(x => `<button type="button" class="chip${x.id === s.id ? ' ativo' : ''}${x.ativo ? '' : ' inativo'}" data-setor-sel="${esc(x.id)}">${esc(x.nome)}</button>`).join('')}
        <button type="button" class="chip" data-acao="novo-setor">+ Setor</button></div>
      <div class="painel">
        <header class="setor-cabeca"><h2>${esc(s.nome)}${s.ativo ? '' : ' <small>(desativado)</small>'}</h2><button type="button" class="btn mini" data-acao="editar-setor">Editar setor</button></header>
        ${pessoasDoSetor(s.id).length ? '' : '<p class="aviso">Ninguém neste setor ainda. Cadastre a equipe na aba Equipe para direcionar as tarefas.</p>'}
        ${tarefas.length ? `<ul class="tarefas">${tarefas.map((t, n) => linhaTarefa(t, n, tarefas.length)).join('')}</ul>` : '<p class="vazio">Nenhuma tarefa neste setor.</p>'}
        <button type="button" class="btn primario" data-acao="nova-tarefa">+ Nova tarefa</button>
      </div>`;
  }
  function abaEquipe() {
    const pessoas = App.estado.pessoas.slice().sort((a, b) => (b.ativo - a.ativo) || porNome(a, b));
    const gerentes = pessoas.filter(p => p.ativo && p.gerente).length;
    return `<div class="painel">
      ${gerentes < 2 ? '<p class="aviso">Cadastre pelo menos 2 gerentes, para sempre ter alguém que corrija e administre.</p>' : ''}
      <ul class="equipe">${pessoas.map(p => `<li class="pessoa${p.ativo ? '' : ' inativo'}" data-pessoa-cad="${esc(p.id)}">
        <div><b>${esc(p.nome)}</b> <small>@${esc(p.usuario)}</small><br>
          <small>${esc(nomeSetor(p.setor_id))}${p.lider ? ' · <span class="selo">líder</span>' : ''}${p.gerente ? ' · <span class="selo ouro">gerente</span>' : ''}${p.ativo ? '' : ' · desativado'}</small></div>
        <button type="button" class="btn mini" data-acao="editar-pessoa">Editar</button></li>`).join('')}</ul>
      <button type="button" class="btn primario" data-acao="nova-pessoa">+ Novo funcionário</button>
    </div>`;
  }
  function abaFuncionamento() {
    const abertos = App.estado.diasAbertos;
    return `<div class="painel"><h2>Dias em que o restaurante abre</h2>
      <p class="ajuda">Nos dias fechados nenhuma tarefa diária aparece.</p>
      <div class="opcoes">${R.SEMANA.map((n, i) => `<label class="opcao"><input type="checkbox" name="dia-aberto" value="${i}" ${abertos.includes(i) ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div>
    </div>`;
  }

  async function desenhar(tela) {
    cad = await Nuvem.carregarCadastro();
    const abas = [['tarefas', 'Setores e tarefas'], ['equipe', 'Equipe'], ['funcionamento', 'Funcionamento'], ['imprimir', 'Imprimir']];
    tela.innerHTML = `<section class="tela-cadastro">
      <header class="cabeca-dia"><h1>Cadastro</h1></header>
      <div class="filtros" role="tablist">${abas.map(([k, n]) => `<button type="button" class="chip${aba === k ? ' ativo' : ''}" data-aba="${k}" role="tab" aria-selected="${aba === k}">${n}</button>`).join('')}</div>
      ${aba === 'tarefas' ? abaTarefas() : aba === 'equipe' ? abaEquipe() : aba === 'imprimir' ? Imprimir.aba() : abaFuncionamento()}
    </section>`;
  }

  // ---- gravar ----
  async function gravar(erroEl, fn, mensagem) {
    try {
      await fn();
      if (formulario().open) formulario().close();
      if (mensagem) App.toast(mensagem);
      await App.aposCadastro();
      return true;
    } catch (err) {
      if (err.sessao) return false;
      if (erroEl && formulario().open) erroEl.textContent = err.message;
      else App.toast(err.message, 'erro');
      return false;
    }
  }

  // ---- setor ----
  function abrirSetor(s) {
    const novo = !s;
    s = s || { id: App.novoId(), nome: '', ordem: App.estado.setores.length, ativo: true };
    formulario().innerHTML = `<form id="form-setor" class="form" data-id="${esc(s.id)}">
      <h2>${novo ? 'Novo setor' : 'Editar setor'}</h2>
      <label class="campo"><span>Nome do setor</span><input id="s-nome" maxlength="40" value="${esc(s.nome)}" placeholder="Ex.: Garçons"></label>
      <p class="form-erro" id="s-erro" role="alert"></p>
      <div class="dialogo-botoes">
        ${novo ? '' : `<button type="button" class="btn ${s.ativo ? 'perigo' : ''}" data-acao="alternar-setor">${s.ativo ? 'Desativar setor' : 'Reativar setor'}</button>`}
        <button type="button" class="btn" data-acao="cancelar">Cancelar</button><button type="submit" class="btn primario">Salvar</button>
      </div></form>`;
    formulario().showModal();
    document.getElementById('s-nome').focus();
  }
  async function salvarSetor(form, extra = {}) {
    const orig = App.estado.setores.find(x => x.id === form.dataset.id);
    const s = { ...(orig || { id: form.dataset.id, ordem: App.estado.setores.length, ativo: true }), nome: form.querySelector('#s-nome').value.trim(), ...extra };
    const erroEl = form.querySelector('#s-erro');
    if (!s.nome) { erroEl.textContent = 'Informe o nome do setor.'; return; }
    setorSel = s.id;
    await gravar(erroEl, () => Nuvem.salvarSetor(s), 'Setor salvo.');
  }

  // ---- tarefa ----
  function abrirTarefa(t) {
    const nova = !t;
    t = t || { id: App.novoId(), setor_id: setorSel, titulo: '', horario: null, frequencia: 'diaria', dias_semana: [], ordem: proximaOrdem(setorSel), ativo: true };
    const marcados = direcionados(t.id);
    const pessoas = pessoasDoSetor(t.setor_id);
    const diasT = (t.dias_semana || []).map(Number);
    formulario().innerHTML = `<form id="form-tarefa" class="form" data-id="${esc(t.id)}">
      <h2>${nova ? 'Nova tarefa' : 'Editar tarefa'}</h2>
      <label class="campo"><span>Tarefa</span><input id="t-titulo" maxlength="120" value="${esc(t.titulo)}" placeholder="Ex.: Abastecer freezer de bebidas"></label>
      <label class="campo"><span>Horário <small>(opcional)</small></span><input id="t-horario" type="time" value="${esc(R.hhmm(t.horario))}"></label>
      <fieldset class="campo"><legend>Frequência</legend><div class="opcoes">${Object.entries(R.FREQUENCIAS).map(([k, n]) =>
        `<label class="opcao"><input type="radio" name="t-freq" value="${k}" ${t.frequencia === k ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div></fieldset>
      <fieldset class="campo" id="t-dias" ${t.frequencia === 'dias' ? '' : 'hidden'}><legend>Em quais dias</legend><div class="opcoes">${R.SEMANA_CURTA.map((n, i) =>
        `<label class="opcao"><input type="checkbox" name="t-dia" value="${i}" ${diasT.includes(i) ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div></fieldset>
      <fieldset class="campo"><legend>Quem faz</legend>${pessoas.length ? `<div class="opcoes">${pessoas.map(p =>
        `<label class="opcao"><input type="checkbox" name="t-pessoa" value="${esc(p.id)}" ${marcados.includes(p.id) ? 'checked' : ''}><span>${esc(p.nome)}</span></label>`).join('')}</div>`
        : '<p class="vazio">Ninguém neste setor ainda.</p>'}</fieldset>
      <p class="form-erro" id="t-erro" role="alert"></p>
      <div class="dialogo-botoes">
        ${nova ? '' : '<button type="button" class="btn perigo" data-acao="remover-tarefa">Remover tarefa</button>'}
        <button type="button" class="btn" data-acao="cancelar">Cancelar</button><button type="submit" class="btn primario" id="t-salvar">Salvar</button>
      </div></form>`;
    formulario().showModal();
    document.getElementById('t-titulo').focus();
  }
  async function salvarTarefa(form) {
    const orig = cad.tarefas.find(x => x.id === form.dataset.id);
    const freq = form.querySelector('[name=t-freq]:checked');
    const t = {
      ...(orig || { id: form.dataset.id, setor_id: setorSel, ordem: proximaOrdem(setorSel), ativo: true }),
      titulo: form.querySelector('#t-titulo').value.trim(),
      horario: form.querySelector('#t-horario').value || null,
      frequencia: freq ? freq.value : '',
      dias_semana: [...form.querySelectorAll('[name=t-dia]:checked')].map(c => Number(c.value)),
    };
    if (t.frequencia !== 'dias') t.dias_semana = [];
    const erroEl = form.querySelector('#t-erro');
    const problema = R.validarTarefa(t);
    if (problema) { erroEl.textContent = problema; return; }
    const pessoas = [...form.querySelectorAll('[name=t-pessoa]:checked')].map(c => c.value);
    const botao = form.querySelector('#t-salvar');
    botao.disabled = true;
    const ok = await gravar(erroEl, async () => { await Nuvem.salvarTarefa(t); await Nuvem.direcionar(t.id, pessoas); }, 'Tarefa salva.');
    if (!ok) botao.disabled = false;
  }
  async function removerTarefa(form) {
    const t = cad.tarefas.find(x => x.id === form.dataset.id);
    if (await App.escolher(`Remover "${t.titulo}"? Ela sai das listas a partir de agora; o histórico continua.`, [['sim', 'Remover', 'primario'], ['', 'Cancelar']]) !== 'sim') return;
    await gravar(form.querySelector('#t-erro'), () => Nuvem.salvarTarefa({ ...t, ativo: false }), 'Tarefa removida.');
  }
  async function mover(tid, passo) {
    const lista = tarefasDoSetor(setorSel);
    const i = lista.findIndex(t => t.id === tid), j = i + passo;
    if (i < 0 || j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    const mudadas = lista.map((t, n) => ({ ...t, ordem: n })).filter((t, n) => t.ordem !== cad.tarefas.find(x => x.id === t.id).ordem || n === i || n === j);
    await gravar(null, () => Nuvem.salvarTarefa(mudadas));
  }

  // ---- pessoa ----
  function abrirPessoa(p) {
    const nova = !p;
    p = p || { id: '', nome: '', usuario: '', setor_id: setorSel || null, lider: false, gerente: false, ativo: true };
    const setores = App.estado.setores.filter(s => s.ativo || s.id === p.setor_id).sort(porNome);
    formulario().innerHTML = `<form id="form-pessoa" class="form" data-id="${esc(p.id)}">
      <h2>${nova ? 'Novo funcionário' : esc(p.nome)}</h2>
      <label class="campo"><span>Nome</span><input id="p-nome" maxlength="60" value="${esc(p.nome)}"></label>
      ${nova ? '<label class="campo"><span>Usuário (para entrar)</span><input id="p-usuario" autocapitalize="none" spellcheck="false" placeholder="ex.: joao"></label>'
        : `<p class="ajuda">Usuário: <b>@${esc(p.usuario)}</b></p>`}
      <label class="campo"><span>${nova ? 'Senha' : 'Nova senha <small>(deixe em branco para manter)</small>'}</span><input id="p-senha" type="text" autocomplete="off"></label>
      <label class="campo"><span>Setor</span><select id="p-setor"><option value="">Sem setor</option>${setores.map(s =>
        `<option value="${esc(s.id)}" ${s.id === p.setor_id ? 'selected' : ''}>${esc(s.nome)}</option>`).join('')}</select></label>
      <label class="opcao linha"><input type="checkbox" id="p-lider" ${p.lider ? 'checked' : ''}><span>Líder do setor (acompanha os colegas do setor)</span></label>
      <label class="opcao linha"><input type="checkbox" id="p-gerente" ${p.gerente ? 'checked' : ''}><span>Gerente (vê tudo e administra o cadastro)</span></label>
      <p class="form-erro" id="p-erro" role="alert"></p>
      <div class="dialogo-botoes">
        ${nova ? '' : `<button type="button" class="btn ${p.ativo ? 'perigo' : ''}" data-acao="${p.ativo ? 'desativar' : 'reativar'}">${p.ativo ? 'Desativar' : 'Reativar'}</button>`}
        <button type="button" class="btn" data-acao="cancelar">Cancelar</button><button type="submit" class="btn primario" id="p-salvar">Salvar</button>
      </div></form>`;
    formulario().showModal();
    document.getElementById('p-nome').focus();
  }
  async function salvarPessoa(form) {
    const id = form.dataset.id || null;
    const v = sel => form.querySelector(sel).value;
    const dados = { nome: v('#p-nome').trim(), setor_id: v('#p-setor') || null, lider: form.querySelector('#p-lider').checked,
      gerente: form.querySelector('#p-gerente').checked, senha: v('#p-senha') };
    if (!id) dados.usuario = R.normalizarUsuario(v('#p-usuario'));
    const erroEl = form.querySelector('#p-erro');
    const problema = R.validarPessoa(dados, { nova: !id });
    if (problema) { erroEl.textContent = problema; return; }
    const botao = form.querySelector('#p-salvar');
    botao.disabled = true;
    const ok = await gravar(erroEl, async () => {
      if (!id) { await Nuvem.equipe('criar', dados); return; }
      await Nuvem.equipe('editar', { id, nome: dados.nome, setor_id: dados.setor_id, lider: dados.lider, gerente: dados.gerente });
      if (dados.senha) await Nuvem.equipe('trocar_senha', { id, senha: dados.senha });
    }, id ? 'Alterações salvas.' : `Conta criada. Usuário: ${dados.usuario}`);
    if (!ok) botao.disabled = false;
  }
  async function alternarAtivo(form, acao) {
    const p = App.pessoa(form.dataset.id);
    const pergunta = acao === 'desativar' ? `Desativar ${p.nome}? A pessoa não consegue mais entrar; o histórico continua.` : `Reativar ${p.nome}?`;
    if (await App.escolher(pergunta, [['sim', acao === 'desativar' ? 'Desativar' : 'Reativar', 'primario'], ['', 'Cancelar']]) !== 'sim') return;
    await gravar(form.querySelector('#p-erro'), () => Nuvem.equipe(acao, { id: p.id }), acao === 'desativar' ? 'Conta desativada.' : 'Conta reativada.');
  }

  // ---- eventos ----
  document.addEventListener('click', ev => {
    const b = ev.target.closest('.tela-cadastro [data-aba], .tela-cadastro [data-setor-sel], .tela-cadastro [data-acao], #formulario [data-acao]');
    if (!b || b.disabled) return;
    if (b.dataset.aba) { aba = b.dataset.aba; App.redesenhar().catch(App.erro); return; }
    if (b.dataset.setorSel) { setorSel = b.dataset.setorSel; App.redesenhar().catch(App.erro); return; }
    const form = b.closest('form');
    const tid = b.closest('[data-tarefa]') && b.closest('[data-tarefa]').dataset.tarefa;
    const pid = b.closest('[data-pessoa-cad]') && b.closest('[data-pessoa-cad]').dataset.pessoaCad;
    const acoes = {
      'novo-setor': () => abrirSetor(null),
      'editar-setor': () => abrirSetor(App.estado.setores.find(s => s.id === setorSel)),
      'alternar-setor': () => salvarSetor(form, { ativo: !App.estado.setores.find(s => s.id === form.dataset.id).ativo }),
      'nova-tarefa': () => abrirTarefa(null),
      'editar-tarefa': () => abrirTarefa(cad.tarefas.find(t => t.id === tid)),
      'remover-tarefa': () => removerTarefa(form),
      subir: () => mover(tid, -1),
      descer: () => mover(tid, 1),
      'nova-pessoa': () => abrirPessoa(null),
      'editar-pessoa': () => abrirPessoa(App.pessoa(pid)),
      desativar: () => alternarAtivo(form, 'desativar'),
      reativar: () => alternarAtivo(form, 'reativar'),
    };
    const fn = acoes[b.dataset.acao];
    if (fn) Promise.resolve(fn()).catch(App.erro);
  });
  document.addEventListener('change', ev => {
    if (ev.target.matches('#form-tarefa [name=t-freq]')) document.getElementById('t-dias').hidden = ev.target.value !== 'dias';
    if (ev.target.matches('.tela-cadastro [name=dia-aberto]')) {
      const dias = [...document.querySelectorAll('[name=dia-aberto]:checked')].map(c => Number(c.value));
      gravar(null, () => Nuvem.salvarDiasAbertos(dias), 'Dias de funcionamento salvos.').catch(App.erro);
    }
  });
  document.addEventListener('submit', ev => {
    if (ev.target.id === 'form-setor') salvarSetor(ev.target).catch(App.erro);
    if (ev.target.id === 'form-tarefa') salvarTarefa(ev.target).catch(App.erro);
    if (ev.target.id === 'form-pessoa') salvarPessoa(ev.target).catch(App.erro);
  });

  window.Cadastro = { dados: () => cad }; // a impressão usa as tarefas e os direcionamentos já carregados
  App.registrarTela('cadastro', desenhar);
})();
