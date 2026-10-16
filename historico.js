// Tela "Histórico" (líder e gerente): o que foi feito em cada dia e o resumo do mês por funcionário.
(function () {
  const R = window.Regras;
  const esc = s => App.esc(s);
  let mes = null;   // { ano, mes }
  let dia = null;   // dia escolhido
  let dados = null; // { chave, itens, fechamentos, validacoes }
  const porNome = (a, b) => a.nome.localeCompare(b.nome, 'pt-BR');
  const chaveMes = m => `${m.ano}-${String(m.mes).padStart(2, '0')}`;

  // O mês de hoje é relido a cada desenho (o dia ainda está mudando); os passados ficam guardados.
  async function garantirDados() {
    const k = chaveMes(mes);
    const doMesAtual = k === chaveMes(R.mesDoDia(App.estado.dia));
    if (dados && dados.chave === k && !doMesAtual) return;
    const dias = R.diasDoMes(mes.ano, mes.mes);
    dados = { chave: k, ...(await Nuvem.carregarPeriodo(dias[0], dias[dias.length - 1])) };
  }
  // Quem este usuário acompanha (o banco já filtra pelo perfil).
  const acompanhados = () => App.estado.pessoas.filter(p => p.setor_id).sort(porNome);

  function tabelaResumo(linhas) {
    if (!linhas.length) return '<p class="vazio">Sem tarefas neste mês.</p>';
    return `<table class="resumo"><thead><tr><th>Funcionário</th><th>Feito</th><th>Liberadas</th><th>Dias fechados</th></tr></thead><tbody>
      ${linhas.map(r => `<tr data-resumo="${esc(r.pessoa.id)}"><td>${esc(r.pessoa.nome)}</td><td><b>${r.pct}%</b> <small>${r.feitos}/${r.total}</small></td>
        <td>${r.liberados}</td><td>${r.fechados} de ${r.dias}</td></tr>`).join('')}
    </tbody></table>`;
  }

  function pessoaNoDia(p, d, itens) {
    const f = dados.fechamentos.find(x => x.pessoa_id === p.id && x.dia === d);
    const linhas = R.ordenar(itens).map(i => {
      const est = R.estadoNoDia(i, d);
      const txt = est === 'feito' ? `feito ${R.formatarHora(i.feito_em)}` : est === 'liberado' ? `liberado: ${esc(i.motivo_liberacao)}` : 'não feito';
      return `<li class="hist-item ${est}"><span>${i.horario ? `<span class="hora">${R.hhmm(i.horario)}</span>` : ''}${esc(i.titulo)}</span>
        <small>${txt}</small>${i.observacao ? `<p class="obs">“${esc(i.observacao)}”</p>` : ''}</li>`;
    }).join('');
    return `<div class="hist-pessoa" data-hist-pessoa="${esc(p.id)}">
      <div class="hist-cabeca"><b>${esc(p.nome)}</b> ${f ? `<span class="selo-ok">fechou ${R.formatarHora(f.fechado_em)}</span>` : '<span class="selo-falta">não fechou</span>'}</div>
      <ul>${linhas}</ul></div>`;
  }

  function detalheDia(d) {
    const itens = dados.itens.filter(i => i.periodo <= d && i.fim >= d);
    if (!itens.length) return `<p class="vazio">Nenhuma tarefa registrada em ${esc(R.formatarDiaLongo(d))}.</p>`;
    const setores = App.estado.setores.slice().sort((a, b) => a.ordem - b.ordem || porNome(a, b));
    const blocos = setores.map(s => {
      const pessoas = acompanhados().filter(p => p.setor_id === s.id && itens.some(i => i.pessoa_id === p.id));
      if (!pessoas.length) return '';
      const v = dados.validacoes.find(x => x.setor_id === s.id && x.dia === d);
      return `<section class="setor"><header class="setor-cabeca"><h3>${esc(s.nome)}</h3>
        ${v ? `<span class="selo-ok">Validado por ${esc(R.primeiroNome(v.validado_por_nome))} às ${R.formatarHora(v.validado_em)}</span>` : '<span class="selo-falta">Não validado</span>'}</header>
        ${pessoas.map(p => pessoaNoDia(p, d, itens.filter(i => i.pessoa_id === p.id))).join('')}</section>`;
    }).join('');
    return `<p class="sobre">${esc(R.formatarDiaLongo(d))}</p>${blocos}`;
  }

  async function desenhar(tela) {
    const hoje = App.estado.dia;
    if (!mes) { mes = R.mesDoDia(hoje); dia = hoje; }
    await garantirDados();
    const dias = R.diasDoMes(mes.ano, mes.mes).filter(d => d <= hoje);
    if (!dias.includes(dia)) dia = dias[dias.length - 1] || null;
    const noMesAtual = chaveMes(mes) === chaveMes(R.mesDoDia(hoje));
    const resumo = R.resumoMes(acompanhados(), dados.itens, dados.fechamentos, mes.ano, mes.mes);
    tela.innerHTML = `<section class="tela-historico">
      <header class="cabeca-dia"><h1>Histórico</h1>
        <div class="mes-nav">
          <button type="button" class="btn-icone" data-acao="mes" data-n="-1" aria-label="Mês anterior">‹</button>
          <b>${esc(R.nomeDoMes(mes.ano, mes.mes))}</b>
          <button type="button" class="btn-icone" data-acao="mes" data-n="1" aria-label="Próximo mês" ${noMesAtual ? 'disabled' : ''}>›</button>
        </div>
      </header>
      <section class="bloco"><h2>Resumo do mês</h2>${tabelaResumo(resumo)}</section>
      <section class="bloco"><h2>Dia</h2>
        <div class="dias">${dias.map(d => `<button type="button" class="chip${d === dia ? ' ativo' : ''}" data-dia="${d}">${Number(d.slice(8))}</button>`).join('')}</div>
        ${dia ? detalheDia(dia) : ''}
      </section>
    </section>`;
  }

  document.addEventListener('click', ev => {
    const m = ev.target.closest('.tela-historico [data-acao=mes]');
    if (m && !m.disabled) { mes = R.somarMeses(mes.ano, mes.mes, Number(m.dataset.n)); dia = null; App.redesenhar().catch(App.erro); return; }
    const d = ev.target.closest('.tela-historico [data-dia]');
    if (d) { dia = d.dataset.dia; App.redesenhar().catch(App.erro); }
  });

  App.registrarTela('historico', desenhar);
})();
