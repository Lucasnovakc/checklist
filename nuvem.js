// Nuvem (Supabase): login por usuário, leitura do dia, ações nas tarefas, cadastro e tempo real.
// Os testes trocam o projeto por um Supabase falso via window.__NUVEM_TESTE.
(function () {
  const conf = window.__NUVEM_TESTE || window.CHECKLIST_NUVEM;
  const ativa = !!(window.supabase && conf && conf.url);
  const cliente = ativa ? window.supabase.createClient(conf.url, conf.chave, { auth: { storageKey: 'checklist:sessao' } }) : null;
  const TABELAS = ['itens', 'fechamentos', 'validacoes', 'pessoas', 'setores', 'tarefas', 'tarefa_pessoas', 'config'];
  const SEM_INTERNET = 'Sem internet. Tente de novo quando a conexão voltar.';
  const ouvintes = { mudou: [], saiu: [] };
  let canal = null;
  let timer = null;

  const ehRede = err => navigator.onLine === false || /fetch|network|load failed/i.test(String((err && (err.message || err.details)) || err));
  const erroDeRede = () => Object.assign(new Error(SEM_INTERNET), { rede: true });

  // Vários pedidos podem voltar 401 juntos: avisa só uma vez por sessão.
  let saida = null;
  function avisarSaida() {
    if (!saida) saida = (async () => {
      pararDeEscutar();
      try { await cliente.auth.signOut({ scope: 'local' }); } catch {}
      ouvintes.saiu.forEach(fn => fn());
    })();
    return saida;
  }

  // Espera a resposta do supabase-js e transforma erro em mensagem para a pessoa.
  async function exigir(pedido) {
    let r;
    try { r = await pedido; } catch (err) { throw ehRede(err) ? erroDeRede() : new Error(String((err && err.message) || err)); }
    if (!r.error) return r.data;
    if (r.status === 401 || r.error.code === 'PGRST301' || r.error.code === 'PGRST303') {
      await avisarSaida();
      throw Object.assign(new Error('Sua sessão expirou. Entre de novo.'), { sessao: true });
    }
    if (!r.status || ehRede(r.error)) throw erroDeRede();
    throw Object.assign(new Error(r.error.message), { code: r.error.code });
  }

  let saindoPorVontade = false;
  if (cliente) cliente.auth.onAuthStateChange(ev => {
    if (ev === 'SIGNED_OUT' && !saindoPorVontade) setTimeout(() => avisarSaida(), 0);
  });

  async function sessao() {
    if (!ativa) return null;
    const { data } = await cliente.auth.getSession();
    return data.session;
  }

  async function entrar(usuario, senha) {
    let r;
    try { r = await cliente.auth.signInWithPassword({ email: Regras.emailDe(usuario), password: senha }); }
    catch { return { ok: false, erro: 'Sem internet ou servidor fora do ar. Tente de novo.' }; }
    const { error } = r;
    if (!error) { saida = null; return { ok: true }; }
    if (/banned/i.test(error.message)) return { ok: false, erro: 'Essa conta foi desativada. Fale com o gerente.' };
    if (error.status === 400) return { ok: false, erro: 'Usuário ou senha incorretos.' };
    if (ehRede(error) || !error.status) return { ok: false, erro: 'Sem internet ou servidor fora do ar. Tente de novo.' };
    return { ok: false, erro: 'Não foi possível entrar: ' + error.message };
  }

  async function sair() {
    pararDeEscutar();
    saindoPorVontade = true;
    try { await cliente.auth.signOut({ scope: 'local' }); }
    finally { saindoPorVontade = false; }
  }

  // Função "equipe" (Edge Function): devolve a mensagem que ela mandar.
  async function equipe(acao, dados) {
    let r;
    try { r = await cliente.functions.invoke('equipe', { body: { acao, dados } }); }
    catch { throw erroDeRede(); }
    if (!r.error) return r.data;
    if (r.error.name === 'FunctionsFetchError' || r.error.name === 'FunctionsRelayError') throw erroDeRede();
    let msg = r.error.message;
    try { const corpo = await r.error.context.json(); if (corpo && corpo.erro) msg = corpo.erro; } catch {}
    throw new Error(msg);
  }

  const precisaPrimeiroAcesso = () => exigir(cliente.rpc('precisa_primeiro_acesso'));
  const criarPrimeiroGerente = dados => equipe('primeiro_gerente', dados);

  async function meuPerfil() {
    const s = await sessao();
    if (!s) return null;
    return (await exigir(cliente.from('pessoas').select('*').eq('id', s.user.id)))[0] || null;
  }
  const gerarHoje = () => exigir(cliente.rpc('gerar_hoje'));

  async function carregarDia(dia) {
    const [pessoas, itens, fechamentos, validacoes, setores, config] = await Promise.all([
      exigir(cliente.from('pessoas').select('*')),
      exigir(cliente.from('itens').select('*').lte('periodo', dia).gte('fim', dia)),
      exigir(cliente.from('fechamentos').select('*').eq('dia', dia)),
      exigir(cliente.from('validacoes').select('*').eq('dia', dia)),
      exigir(cliente.from('setores').select('*')),
      exigir(cliente.from('config').select('dias_abertos').eq('id', 1)),
    ]);
    return { pessoas, itens, fechamentos, validacoes, setores, diasAbertos: config[0] ? config[0].dias_abertos.map(Number) : [0, 1, 2, 3, 4, 5, 6] };
  }
  // O Supabase devolve no máximo 1000 linhas por pedido: um mês inteiro de itens precisa vir em páginas.
  async function todasAsLinhas(consulta) {
    const PAGINA = 1000;
    const linhas = [];
    for (let de = 0; ; de += PAGINA) {
      const pagina = await exigir(consulta().order('id').range(de, de + PAGINA - 1));
      linhas.push(...pagina);
      if (pagina.length < PAGINA) return linhas;
    }
  }
  async function carregarPeriodo(inicio, fim) {
    const [itens, fechamentos, validacoes] = await Promise.all([
      todasAsLinhas(() => cliente.from('itens').select('*').lte('periodo', fim).gte('fim', inicio)),
      exigir(cliente.from('fechamentos').select('*').gte('dia', inicio).lte('dia', fim)), // até 12 pessoas × 31 dias: cabe numa página
      exigir(cliente.from('validacoes').select('*').gte('dia', inicio).lte('dia', fim)),
    ]);
    return { itens, fechamentos, validacoes };
  }
  async function carregarCadastro() {
    const [tarefas, tarefaPessoas] = await Promise.all([
      exigir(cliente.from('tarefas').select('*')),
      exigir(cliente.from('tarefa_pessoas').select('*')),
    ]);
    return { tarefas, tarefaPessoas };
  }

  const rpc = (nome, args) => exigir(cliente.rpc(nome, args));
  const marcar = (item, feito) => rpc('marcar', { p_item: item, p_feito: feito });
  const anotar = (item, texto) => rpc('anotar', { p_item: item, p_texto: texto });
  const liberar = (item, motivo) => rpc('liberar', { p_item: item, p_motivo: motivo });
  const desfazerLiberacao = item => rpc('desfazer_liberacao', { p_item: item });
  const fecharDia = pessoa => rpc('fechar_dia', { p_pessoa: pessoa });
  const reabrirDia = pessoa => rpc('reabrir_dia', { p_pessoa: pessoa });
  const validarSetor = (setor, observacao) => rpc('validar_setor', { p_setor: setor, p_observacao: observacao || null });
  const direcionar = (tarefa, pessoas) => rpc('direcionar', { p_tarefa: tarefa, p_pessoas: pessoas });

  const salvarSetor = ({ id, nome, ordem, ativo }) => exigir(cliente.from('setores').upsert({ id, nome, ordem, ativo }));
  const linhaTarefa = ({ id, setor_id, titulo, horario, frequencia, dias_semana, ordem, ativo }) =>
    ({ id, setor_id, titulo, horario: horario || null, frequencia, dias_semana: dias_semana || [], ordem, ativo });
  const salvarTarefa = t => exigir(cliente.from('tarefas').upsert([].concat(t).map(linhaTarefa)));
  const salvarDiasAbertos = dias => exigir(cliente.from('config').upsert({ id: 1, dias_abertos: dias }));

  // Tempo real: qualquer mudança feita em outro aparelho avisa o app (agrupado em 300 ms).
  function escutar() {
    if (!ativa || conf.realtime === false || canal) return;
    canal = cliente.channel('checklist');
    const avisar = () => { clearTimeout(timer); timer = setTimeout(() => ouvintes.mudou.forEach(fn => fn()), 300); };
    for (const t of TABELAS) canal.on('postgres_changes', { event: '*', schema: 'public', table: t }, avisar);
    canal.subscribe(status => { if (status === 'SUBSCRIBED') avisar(); }); // (re)conectou: relê o que pode ter perdido
  }
  function pararDeEscutar() {
    if (canal) { cliente.removeChannel(canal); canal = null; }
  }

  window.Nuvem = {
    ativa, sessao, entrar, sair, precisaPrimeiroAcesso, criarPrimeiroGerente, meuPerfil, gerarHoje,
    carregarDia, carregarPeriodo, carregarCadastro,
    marcar, anotar, liberar, desfazerLiberacao, fecharDia, reabrirDia, validarSetor, direcionar,
    salvarSetor, salvarTarefa, salvarDiasAbertos, equipe,
    escutar, pararDeEscutar,
    aoMudar: fn => ouvintes.mudou.push(fn),
    aoSairDaConta: fn => ouvintes.saiu.push(fn),
    _cliente: cliente, // só para os testes
  };
})();
