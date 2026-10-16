// Núcleo do Checklist: quem entrou, estado do dia, navegação, ações (com fila sem internet) e avisos.
(function () {
  const R = window.Regras;
  const estado = { eu: null, dia: null, diasAbertos: [0, 1, 2, 3, 4, 5, 6], pessoas: [], itens: [], fechamentos: [], validacoes: [], setores: [], semConexao: false };
  const telas = {};
  let telaAtual = null;
  let fila = null;
  const emVoo = new Map();        // 'tipo|item' → op enviada e ainda sem resposta
  let leitura = 0;                // só a leitura mais recente vale
  let cadeia = Promise.resolve(); // envios um de cada vez, na ordem dos toques

  const agora = () => (window.__AGORA ? new Date(window.__AGORA) : new Date());
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const novoId = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));

  function toast(msg, tipo) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast visivel' + (tipo ? ' ' + tipo : '');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.className = 'toast'; }, 4500);
  }

  // Caixa de escolha com botões. opcoes: [[valor, rótulo, classe?], ...]; Esc ou valor '' devolve null.
  function escolher(msg, opcoes) {
    const d = document.getElementById('dialogo');
    d.innerHTML = `<p>${esc(msg)}</p><div class="dialogo-botoes">${opcoes.map(([v, r, c]) => `<button type="button" class="btn ${c || ''}" value="${esc(v)}">${esc(r)}</button>`).join('')}</div>`;
    return new Promise(ok => {
      d.onclick = e => { const b = e.target.closest('button'); if (b) { d.close(); ok(b.value || null); } };
      d.oncancel = () => ok(null);
      d.showModal();
    });
  }

  // Pergunta com campo de texto. Devolve o texto ('' se vazio) ou null se cancelou.
  function perguntar(titulo, { valor = '', obrigatorio = false, max = 200, placeholder = '', botao = 'Salvar' } = {}) {
    const d = document.getElementById('dialogo');
    d.innerHTML = `<form id="form-perguntar" class="form"><h2>${esc(titulo)}</h2>
      <textarea id="perguntar-texto" maxlength="${max}" rows="3" placeholder="${esc(placeholder)}">${esc(valor)}</textarea>
      <p class="form-erro" id="perguntar-erro" role="alert"></p>
      <div class="dialogo-botoes"><button type="button" class="btn" data-cancelar>Cancelar</button><button type="submit" class="btn primario">${esc(botao)}</button></div>
    </form>`;
    d.onclick = null;
    return new Promise(ok => {
      d.querySelector('form').onsubmit = e => {
        e.preventDefault();
        const texto = d.querySelector('#perguntar-texto').value.trim();
        if (obrigatorio && !texto) { d.querySelector('#perguntar-erro').textContent = 'Escreva o motivo.'; return; }
        d.close();
        ok(texto);
      };
      d.querySelector('[data-cancelar]').onclick = () => { d.close(); ok(null); };
      d.oncancel = () => ok(null);
      d.showModal();
      d.querySelector('#perguntar-texto').focus();
    });
  }

  function erro(err) {
    console.error(err);
    if (err && err.sessao) return; // o login já foi mostrado
    toast('Algo deu errado: ' + ((err && err.message) || err), 'erro');
  }

  // ---- perfil ----
  const pessoa = id => estado.pessoas.find(p => p.id === id);
  const souGerente = () => !!(estado.eu && estado.eu.gerente);
  const souLider = () => !!(estado.eu && estado.eu.lider);
  const vejoOutros = () => souGerente() || souLider();
  function podeLiberarDe(id) {
    const p = pessoa(id);
    return souGerente() || (souLider() && !!p && p.id !== estado.eu.id && p.setor_id === estado.eu.setor_id);
  }
  const podeValidar = setorId => souGerente() || (souLider() && estado.eu.setor_id === setorId);
  const fechamentoDe = id => estado.fechamentos.find(f => f.pessoa_id === id);
  const itensDe = id => R.ordenar(estado.itens.filter(i => i.pessoa_id === id));
  const aberto = () => estado.diasAbertos.includes(R.diaDaSemana(estado.dia));

  function ajustarMenu() {
    document.querySelectorAll('[data-perfil]').forEach(b => { b.hidden = b.dataset.perfil === 'gerente' ? !souGerente() : !vejoOutros(); });
    document.body.classList.toggle('so-hoje', !vejoOutros());
    document.getElementById('quem').textContent = estado.eu ? R.primeiroNome(estado.eu.nome) : '';
  }

  // ---- telas ----
  function registrarTela(nome, desenhar) { telas[nome] = desenhar; }
  async function ir(nome) {
    if (!telas[nome]) return;
    telaAtual = nome;
    document.body.classList.toggle('sem-login', nome === 'login' || nome === 'primeiro');
    document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('ativo', b.dataset.nav === nome));
    await telas[nome](document.getElementById('tela'));
  }
  const redesenhar = () => (telaAtual ? ir(telaAtual) : Promise.resolve());

  function mostrarFalha(err) {
    telaAtual = null;
    document.getElementById('tela').innerHTML = `<div class="vazio-grande"><p>${esc(err.message || err)}</p>
      <button type="button" class="btn primario" data-acao="tentar-de-novo">Tentar de novo</button></div>`;
  }

  // ---- dados ----
  function sobreporPendentes() {
    if (fila && estado.eu) estado.itens = Fila.aplicarPendentes(estado.itens, [...fila.pendentes(), ...emVoo.values()], estado.eu);
  }
  async function carregarDia() {
    const n = ++leitura;
    const d = await Nuvem.carregarDia(estado.dia);
    if (n !== leitura || !estado.eu) return;
    const eu = d.pessoas.find(p => p.id === estado.eu.id);
    if (!eu || !eu.ativo) { await contaDesativada(); return; }
    // Marcação ainda na fila: continua "sem conexão" para o aviso ficar e a fila ser reenviada.
    Object.assign(estado, d, { eu, semConexao: !!(fila && fila.tamanho()) });
    ajustarMenu();
    sobreporPendentes();
    atualizarFaixa();
  }
  async function sincronizar() {
    await enviarFila();
    try { estado.dia = await Nuvem.gerarHoje(); }
    catch (err) { if (err.rede || err.sessao || !estado.dia) throw err; } // conta desativada: carregarDia percebe
    await carregarDia();
  }
  async function recarregar({ gerar = false } = {}) {
    if (!estado.eu || !telaAtual || telaAtual === 'login' || telaAtual === 'primeiro') return;
    try {
      if (gerar) await sincronizar(); else await carregarDia();
      if (estado.eu) await redesenhar();
    } catch (err) {
      if (err.rede) { estado.semConexao = true; atualizarFaixa(); } else erro(err);
    }
  }
  async function contaDesativada() {
    estado.eu = null;
    fila = null;
    await Nuvem.sair();
    await ir('login');
    toast('Essa conta foi desativada. Fale com o gerente.', 'erro');
  }

  // ---- ações ----
  function emOrdem(fn) {
    const p = cadeia.then(fn, fn);
    cadeia = p.catch(() => {});
    return p;
  }
  const enviar = op => (op.tipo === 'marcar' ? Nuvem.marcar(op.item, op.valor) : Nuvem.anotar(op.item, op.valor));

  // Marcar/anotar: aparece na hora; sem internet vai para a fila; recusa do servidor desfaz e avisa.
  async function agir(op) {
    const k = op.tipo + '|' + op.item;
    emVoo.set(k, op);
    sobreporPendentes();
    await redesenhar();
    try {
      if (!navigator.onLine || (estado.semConexao && fila.tamanho())) throw Object.assign(new Error('offline'), { rede: true });
      await emOrdem(() => enviar(op));
    } catch (err) {
      if (err.rede) { fila.adicionar(op); estado.semConexao = true; }
      else if (!err.sessao) toast(err.message, 'erro');
    } finally {
      if (emVoo.get(k) === op) emVoo.delete(k);
    }
    atualizarFaixa();
    await recarregar();
  }
  const novaOp = (tipo, item, valor) => ({ tipo, item, valor, em: new Date().toISOString() });

  async function enviarFila() {
    if (!fila || !fila.tamanho()) return;
    const recusadas = await emOrdem(() => fila.enviarTudo(enviar));
    atualizarFaixa();
    if (recusadas.length === 1) toast('Uma marcação feita sem internet não foi aceita: ' + recusadas[0].erro.message, 'erro');
    if (recusadas.length > 1) toast(`${recusadas.length} marcações feitas sem internet não foram aceitas.`, 'erro');
    if (fila.tamanho()) throw Object.assign(new Error('Sem internet'), { rede: true });
  }

  // Fechar, liberar e validar dependem do estado conferido no servidor: só com internet.
  async function acaoOnline(fn, mensagemOk) {
    try {
      await enviarFila();
      await fn();
      if (mensagemOk) toast(mensagemOk);
    } catch (err) {
      if (err.rede) {
        estado.semConexao = true;
        atualizarFaixa();
        toast('Precisa de internet para isso. Tente de novo quando a conexão voltar.', 'erro');
      } else if (!err.sessao) toast(err.message, 'erro');
    }
    await recarregar();
  }

  function atualizarFaixa() {
    const el = document.getElementById('faixa-offline');
    const n = fila ? fila.tamanho() : 0;
    el.hidden = !(estado.eu && (!navigator.onLine || estado.semConexao));
    el.textContent = n ? `Sem conexão: ${n === 1 ? '1 marcação aguardando' : n + ' marcações aguardando'} envio` : 'Sem conexão';
  }

  // ---- entrada ----
  async function aposLogin() {
    try {
      const eu = await Nuvem.meuPerfil();
      if (!eu || !eu.ativo) { await contaDesativada(); return; }
      estado.eu = eu;
      fila = Fila.criarFila(localStorage, 'checklist:fila:' + eu.id);
      ajustarMenu();
      await sincronizar();
    } catch (err) {
      if (!err.sessao) mostrarFalha(err);
      return;
    }
    if (!estado.eu) return;
    Nuvem.escutar();
    await ir('hoje');
  }
  async function irParaEntrada() {
    let primeiro = false;
    try { primeiro = await Nuvem.precisaPrimeiroAcesso(); } catch {} // sem internet: mostra o login
    await ir(primeiro ? 'primeiro' : 'login');
  }
  async function iniciar() {
    if (!Nuvem.ativa) { mostrarFalha(new Error('Não foi possível carregar o app. Recarregue a página.')); return; }
    Nuvem.aoMudar(() => recarregar());
    Nuvem.aoSairDaConta(() => { estado.eu = null; fila = null; atualizarFaixa(); if (telaAtual !== 'login') ir('login').catch(erro); });
    if (await Nuvem.sessao()) { await aposLogin(); return; }
    await irParaEntrada();
  }
  async function sair() {
    const r = await escolher('Sair desta conta neste aparelho?', [['sim', 'Sair', 'primario'], ['', 'Cancelar']]);
    if (r !== 'sim') return;
    await Nuvem.sair();
    estado.eu = null;
    fila = null;
    atualizarFaixa();
    await irParaEntrada();
  }

  // ---- eventos ----
  document.addEventListener('click', e => {
    const nav = e.target.closest('[data-nav]');
    if (nav) { ir(nav.dataset.nav).catch(erro); return; }
    if (e.target.closest('[data-sair]')) { sair().catch(erro); return; }
    if (e.target.closest('[data-acao=tentar-de-novo]')) { aposLogin().catch(erro); return; }
    if (e.target.closest('#formulario [data-acao=cancelar]')) document.getElementById('formulario').close();
  });
  // Virada do dia (aparelho aberto de um dia para o outro), volta para a aba e volta da internet: gera e relê tudo.
  const conferirDia = () => { if (estado.eu && estado.dia && R.diaOperacional(agora()) !== estado.dia) recarregar({ gerar: true }); };
  setInterval(conferirDia, window.__INTERVALO_DIA || 60000);
  setInterval(() => { if (estado.semConexao) recarregar({ gerar: true }); }, window.__INTERVALO_REDE || 15000);
  window.addEventListener('focus', conferirDia);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') recarregar({ gerar: true }); });
  window.addEventListener('online', () => { atualizarFaixa(); recarregar({ gerar: true }); });
  window.addEventListener('offline', atualizarFaixa);
  document.addEventListener('submit', e => e.preventDefault());
  window.addEventListener('unhandledrejection', e => erro(e.reason));
  document.addEventListener('DOMContentLoaded', () => iniciar().catch(erro));
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

  window.App = {
    estado, agora, esc, novoId, toast, escolher, perguntar, erro,
    registrarTela, ir, redesenhar, recarregar, aposLogin, irParaEntrada, telaAtual: () => telaAtual,
    souGerente, souLider, vejoOutros, podeLiberarDe, podeValidar, pessoa, fechamentoDe, itensDe, aberto,
    marcar: (item, feito) => agir(novaOp('marcar', item, feito)),
    anotar: (item, texto) => agir(novaOp('anotar', item, texto)),
    fecharDia: id => acaoOnline(() => Nuvem.fecharDia(id), 'Dia fechado.'),
    reabrirDia: id => acaoOnline(() => Nuvem.reabrirDia(id), 'Dia reaberto.'),
    liberar: (item, motivo) => acaoOnline(() => Nuvem.liberar(item, motivo), 'Tarefa liberada.'),
    desfazerLiberacao: item => acaoOnline(() => Nuvem.desfazerLiberacao(item)),
    validarSetor: (setor, obs) => acaoOnline(() => Nuvem.validarSetor(setor, obs), 'Setor validado.'),
    aposCadastro: () => recarregar({ gerar: true }),
  };
})();
