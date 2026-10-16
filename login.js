// Entrada: login por usuário e senha, e o "primeiro acesso" que cria a conta do gerente quando o app está vazio.
(function () {
  const R = window.Regras;
  const logo = '<img class="login-logo" src="logo.png" alt="Barão Bar">';

  function telaLogin(tela) {
    tela.innerHTML = `<div class="tela-entrada">${logo}
      <form id="form-login" class="cartao-entrada" autocomplete="on">
        <h1>Checklist do expediente</h1>
        <label class="campo"><span>Usuário</span><input id="login-usuario" autocomplete="username" autocapitalize="none" spellcheck="false"></label>
        <label class="campo"><span>Senha</span><input id="login-senha" type="password" autocomplete="current-password"></label>
        <p id="login-erro" class="form-erro" role="alert"></p>
        <button type="submit" id="login-entrar" class="btn primario grande">Entrar</button>
      </form>
    </div>`;
    document.getElementById('login-usuario').focus();
  }

  function telaPrimeiro(tela) {
    tela.innerHTML = `<div class="tela-entrada">${logo}
      <form id="form-primeiro" class="cartao-entrada">
        <h1>Criar conta do gerente</h1>
        <p class="ajuda">O app ainda está vazio. Crie a sua conta de gerente; depois você cadastra a equipe pela tela Cadastro.</p>
        <label class="campo"><span>Seu nome</span><input id="pg-nome" autocomplete="name"></label>
        <label class="campo"><span>Usuário (para entrar)</span><input id="pg-usuario" autocapitalize="none" spellcheck="false" placeholder="ex.: lucas"></label>
        <label class="campo"><span>Senha</span><input id="pg-senha" type="password" autocomplete="new-password"></label>
        <p id="pg-erro" class="form-erro" role="alert"></p>
        <button type="submit" id="pg-criar" class="btn primario grande">Criar e entrar</button>
      </form>
    </div>`;
    document.getElementById('pg-nome').focus();
  }

  function ocupado(botao, sim, texto) {
    botao.disabled = sim;
    botao.textContent = texto;
  }

  async function entrar() {
    const usuario = document.getElementById('login-usuario').value;
    const senha = document.getElementById('login-senha').value;
    const erro = document.getElementById('login-erro');
    const botao = document.getElementById('login-entrar');
    if (!usuario.trim() || !senha) { erro.textContent = 'Preencha usuário e senha.'; return; }
    ocupado(botao, true, 'Entrando…');
    erro.textContent = '';
    const r = await Nuvem.entrar(usuario, senha);
    if (!r.ok) { erro.textContent = r.erro; ocupado(botao, false, 'Entrar'); return; }
    await App.aposLogin();
  }

  async function criarPrimeiro() {
    const dados = {
      nome: document.getElementById('pg-nome').value.trim(),
      usuario: R.normalizarUsuario(document.getElementById('pg-usuario').value),
      senha: document.getElementById('pg-senha').value,
    };
    const erro = document.getElementById('pg-erro');
    const botao = document.getElementById('pg-criar');
    const problema = R.validarPessoa(dados, { nova: true });
    if (problema) { erro.textContent = problema; return; }
    ocupado(botao, true, 'Criando…');
    erro.textContent = '';
    try { await Nuvem.criarPrimeiroGerente(dados); }
    catch (err) { erro.textContent = err.message; ocupado(botao, false, 'Criar e entrar'); return; }
    const r = await Nuvem.entrar(dados.usuario, dados.senha);
    if (!r.ok) { erro.textContent = r.erro; ocupado(botao, false, 'Criar e entrar'); return; }
    await App.aposLogin();
  }

  document.addEventListener('submit', e => {
    if (e.target.id === 'form-login') entrar().catch(App.erro);
    if (e.target.id === 'form-primeiro') criarPrimeiro().catch(App.erro);
  });

  App.registrarTela('login', async tela => telaLogin(tela));
  App.registrarTela('primeiro', async tela => telaPrimeiro(tela));
})();
