// Tela "Hoje": as minhas tarefas do dia, marcar, observação e "Fechar meu dia".
(function () {
  const R = window.Regras;
  const esc = s => App.esc(s);

  // Linha de uma tarefa (também usada no Acompanhar). `acoes` = HTML de botões extras.
  function linhaItem(i, { dia, agora, clicavel, acoes = '' }) {
    const atrasado = R.atrasado(i, dia, agora);
    const porOutro = i.marcado_por && i.marcado_por !== i.pessoa_id ? ` por ${esc(R.primeiroNome(i.marcado_por_nome))}` : '';
    let meta = '';
    if (i.estado === 'feito') meta = `<span class="meta feito">feito ${R.formatarHora(i.feito_em)}${porOutro}</span>`;
    if (i.estado === 'liberado') meta = `<span class="meta liberado">liberado por ${esc(R.primeiroNome(i.marcado_por_nome))}: ${esc(i.motivo_liberacao)}</span>`;
    const prazo = R.prazo(i);
    return `<li class="item ${i.estado}${atrasado ? ' atrasado' : ''}" data-item="${esc(i.id)}">
      <button type="button" class="item-marca" data-acao="alternar" ${clicavel ? '' : 'disabled'} aria-pressed="${i.estado === 'feito'}"
        aria-label="${i.estado === 'feito' ? 'Desmarcar' : 'Marcar como feita'}: ${esc(i.titulo)}"><span class="check" aria-hidden="true"></span></button>
      <div class="item-corpo" data-acao="alternar">
        <div class="item-titulo">${i.horario ? `<span class="hora">${R.hhmm(i.horario)}</span>` : ''}<span class="item-nome">${esc(i.titulo)}</span></div>
        ${meta}${prazo ? `<span class="meta">${prazo}</span>` : ''}
        ${i.observacao ? `<p class="obs">“${esc(i.observacao)}”</p>` : ''}
      </div>
      ${acoes}
    </li>`;
  }

  function rodape(fech, faltam) {
    if (fech) {
      const por = fech.fechado_por !== fech.pessoa_id ? ' por ' + esc(R.primeiroNome(fech.fechado_por_nome)) : '';
      return `<div class="fechado-aviso">Dia fechado às ${R.formatarHora(fech.fechado_em)}${por}</div>`;
    }
    const texto = faltam === 0 ? 'Fechar meu dia' : faltam === 1 ? 'Falta 1 tarefa para fechar o dia' : `Faltam ${faltam} tarefas para fechar o dia`;
    return `<div class="rodape-fechar"><button type="button" class="btn primario grande" data-acao="fechar-dia" ${faltam ? 'disabled' : ''}>${texto}</button></div>`;
  }

  async function desenhar(tela) {
    const e = App.estado, dia = e.dia, agora = App.agora();
    const meus = App.itensDe(e.eu.id);
    const fech = App.fechamentoDe(e.eu.id);
    const pr = R.progresso(meus);
    const concluidas = pr.feitos + pr.liberados;
    const clicavel = !fech;
    const anotar = clicavel ? '<button type="button" class="btn-icone" data-acao="anotar" aria-label="Observação">✎</button>' : '';
    const bloco = (chave, titulo, lista) => (lista.length ? `<section class="bloco" data-bloco="${chave}"><h2>${titulo}</h2>
      <ul class="itens">${lista.map(i => linhaItem(i, { dia, agora, clicavel, acoes: anotar })).join('')}</ul></section>` : '');
    const corpo = meus.length
      ? bloco('dia', 'Diárias', meus.filter(R.ehDoDia)) + bloco('periodo', 'Da semana / quinzena', meus.filter(i => !R.ehDoDia(i)))
        + rodape(fech, R.faltamParaFechar(meus, dia, e.diasAbertos))
      : `<p class="vazio-grande">${App.aberto() ? 'Nenhuma tarefa para você hoje.' : 'Hoje o restaurante não abre.'}</p>`;
    tela.innerHTML = `<section class="tela-hoje">
      <header class="cabeca-dia">
        <p class="sobre">${esc(R.formatarDiaLongo(dia))}</p>
        <h1>Olá, ${esc(R.primeiroNome(e.eu.nome))}</h1>
        ${meus.length ? `<div class="progresso" role="progressbar" aria-valuemin="0" aria-valuemax="${pr.total}" aria-valuenow="${concluidas}">
          <div class="progresso-barra" style="width:${Math.round(concluidas * 100 / pr.total)}%"></div></div>
          <p class="progresso-texto"><b>${concluidas}</b> de ${pr.total} concluídas</p>` : ''}
      </header>
      ${corpo}
    </section>`;
  }

  async function anotar(item) {
    const texto = await App.perguntar('Observação', { valor: item.observacao || '', placeholder: 'Ex.: faltou sabonete no estoque' });
    if (texto !== null) await App.anotar(item.id, texto);
  }
  async function fechar() {
    const r = await App.escolher('Fechar o seu dia? Depois disso você não consegue mais alterar as tarefas de hoje.', [['sim', 'Fechar o dia', 'primario'], ['', 'Cancelar']]);
    if (r === 'sim') await App.fecharDia(App.estado.eu.id);
  }

  document.addEventListener('click', ev => {
    const b = ev.target.closest('.tela-hoje [data-acao]');
    if (!b || b.disabled) return;
    const li = b.closest('[data-item]');
    const item = li && App.estado.itens.find(i => i.id === li.dataset.item);
    const fechado = !!App.fechamentoDe(App.estado.eu.id);
    if (b.dataset.acao === 'alternar' && item && !fechado) App.marcar(item.id, item.estado !== 'feito').catch(App.erro);
    if (b.dataset.acao === 'anotar' && item && !fechado) anotar(item).catch(App.erro);
    if (b.dataset.acao === 'fechar-dia') fechar().catch(App.erro);
  });

  window.Hoje = { linhaItem };
  App.registrarTela('hoje', desenhar);
})();
