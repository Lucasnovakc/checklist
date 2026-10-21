// Regras do Checklist Operacional: dia de expediente, períodos das tarefas, o que trava o fechamento
// e os resumos das telas. Funções puras, sem tela e sem rede.
// Datas são texto 'AAAA-MM-DD'; domingo = 0 … sábado = 6.
(function () {
  const VIRADA_HORA = 5;             // antes das 05:00 ainda é o expediente do dia anterior
  const DOMINIO = 'checklist.barao'; // usuário "daniel" vira daniel@checklist.barao no Supabase Auth
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const SEMANA_CURTA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  const FREQUENCIAS = { diaria: 'Todo dia', dias: 'Dias fixos', semanal: '1x por semana', quinzenal: '1x por quinzena' };

  const doisDig = n => String(n).padStart(2, '0');
  const paraTexto = d => `${d.getFullYear()}-${doisDig(d.getMonth() + 1)}-${doisDig(d.getDate())}`;
  function paraData(dia) {
    const [a, m, d] = dia.split('-').map(Number);
    return new Date(a, m - 1, d);
  }
  function somarDias(dia, n) {
    const d = paraData(dia);
    d.setDate(d.getDate() + n);
    return paraTexto(d);
  }
  const diaDaSemana = dia => paraData(dia).getDay();

  function diaOperacional(agora = new Date()) {
    const recua = agora.getHours() < VIRADA_HORA ? 1 : 0;
    return paraTexto(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - recua));
  }

  function diasDoMes(ano, mes) {
    const n = new Date(ano, mes, 0).getDate();
    return Array.from({ length: n }, (_, i) => `${ano}-${doisDig(mes)}-${doisDig(i + 1)}`);
  }
  const mesDoDia = dia => ({ ano: Number(dia.slice(0, 4)), mes: Number(dia.slice(5, 7)) });
  function somarMeses(ano, mes, n) {
    const d = new Date(ano, mes - 1 + n, 1);
    return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
  }

  // Semana de segunda a domingo; quinzenas do dia 1 ao 15 e do 16 ao fim do mês.
  function periodo(frequencia, dia) {
    if (frequencia === 'semanal') {
      const dow = diaDaSemana(dia);
      const inicio = somarDias(dia, dow === 0 ? -6 : 1 - dow);
      return { inicio, fim: somarDias(inicio, 6) };
    }
    if (frequencia === 'quinzenal') {
      const mes = dia.slice(0, 8);
      if (Number(dia.slice(8)) <= 15) return { inicio: mes + '01', fim: mes + '15' };
      const { ano, mes: m } = mesDoDia(dia);
      return { inicio: mes + '16', fim: paraTexto(new Date(ano, m, 0)) };
    }
    return { inicio: dia, fim: dia };
  }

  const abre = (dia, diasAbertos) => diasAbertos.includes(diaDaSemana(dia));
  function devidaNoDia(tarefa, dia, diasAbertos) {
    if (!abre(dia, diasAbertos)) return false;
    return tarefa.frequencia !== 'dias' || (tarefa.dias_semana || []).includes(diaDaSemana(dia));
  }
  function ultimoDiaAberto(de, ate, diasAbertos) {
    let ultimo = null;
    for (let d = de; d <= ate; d = somarDias(d, 1)) if (abre(d, diasAbertos)) ultimo = d;
    return ultimo;
  }
  // Pendente que impede "Fechar meu dia": diária sempre; semanal/quinzenal só no último dia aberto do período.
  // Mesma regra de public.itens_que_travam no sql/checklist.sql.
  function trava(item, dia, diasAbertos) {
    if (item.estado !== 'pendente') return false;
    if (item.frequencia !== 'semanal' && item.frequencia !== 'quinzenal') return true;
    const ultimo = ultimoDiaAberto(dia, item.fim, diasAbertos);
    return ultimo === null || ultimo <= dia;
  }
  const faltamParaFechar = (itens, dia, diasAbertos) => itens.filter(i => trava(i, dia, diasAbertos)).length;

  const ehDoDia = item => item.frequencia === 'diaria' || item.frequencia === 'dias';
  const hhmm = horario => (horario ? String(horario).slice(0, 5) : '');
  // Com horário primeiro (na ordem do expediente, 00:30 depois de 23:00), depois sem horário na ordem do cadastro.
  const minutos = t => { const [h, m] = t.split(':').map(Number); return (h < VIRADA_HORA ? h + 24 : h) * 60 + m; };
  function ordenar(itens) {
    return [...itens].sort((a, b) => {
      if (!!a.horario !== !!b.horario) return a.horario ? -1 : 1;
      if (a.horario && hhmm(a.horario) !== hhmm(b.horario)) return minutos(hhmm(a.horario)) - minutos(hhmm(b.horario));
      return (a.ordem - b.ordem) || String(a.titulo).localeCompare(String(b.titulo), 'pt-BR');
    });
  }
  function atrasado(item, dia, agora = new Date()) {
    if (item.estado !== 'pendente' || !item.horario) return false;
    const hoje = diaOperacional(agora);
    if (hoje !== dia) return hoje > dia;
    return minutos(`${agora.getHours()}:${agora.getMinutes()}`) > minutos(hhmm(item.horario));
  }
  function progresso(itens) {
    const feitos = itens.filter(i => i.estado === 'feito').length;
    const liberados = itens.filter(i => i.estado === 'liberado').length;
    return { total: itens.length, feitos, liberados, pendentes: itens.length - feitos - liberados };
  }
  // Situação do setor no dia, para o "Validar setor": conta só quem está ativo e tem tarefa hoje.
  function situacaoSetor(setorId, { pessoas, itens, fechamentos, validacoes }) {
    const validacao = validacoes.find(v => v.setor_id === setorId);
    if (validacao) return { tipo: 'validado', validacao };
    const comItens = pessoas.filter(p => p.ativo && p.setor_id === setorId && itens.some(i => i.pessoa_id === p.id));
    const faltam = comItens.filter(p => !fechamentos.some(f => f.pessoa_id === p.id)).length;
    return faltam ? { tipo: 'aguardando', faltam } : { tipo: 'pronto' };
  }
  // Como o item estava no fim do dia `dia` (semanal feita mais tarde conta como pendente naquele dia).
  function estadoNoDia(item, dia) {
    if (item.estado === 'pendente' || !item.feito_em) return 'pendente';
    return diaOperacional(new Date(item.feito_em)) > dia ? 'pendente' : item.estado;
  }
  // Por pessoa, no mês: tarefas feitas/liberadas/total (pelo início do período) e dias fechados.
  function resumoMes(pessoas, itens, fechamentos, ano, mes) {
    const prefixo = `${ano}-${doisDig(mes)}`;
    const doMes = itens.filter(i => i.periodo.startsWith(prefixo));
    return pessoas.map(p => {
      const meus = doMes.filter(i => i.pessoa_id === p.id);
      const pr = progresso(meus);
      const dias = new Set(meus.filter(ehDoDia).map(i => i.periodo)).size;
      const fechados = fechamentos.filter(f => f.pessoa_id === p.id && f.dia.startsWith(prefixo)).length;
      return { pessoa: p, ...pr, pct: pr.total ? Math.round(pr.feitos * 100 / pr.total) : null, dias, fechados };
    }).filter(r => r.total > 0);
  }
  function prazo(item) {
    if (item.frequencia === 'semanal') return 'até domingo';
    if (item.frequencia === 'quinzenal') return `até dia ${Number(item.fim.slice(8))}`;
    return '';
  }
  function descreverFrequencia(t) {
    if (t.frequencia === 'dias') return [...(t.dias_semana || [])].map(Number).sort((a, b) => a - b).map(d => SEMANA_CURTA[d]).join(', ');
    return FREQUENCIAS[t.frequencia] || '';
  }

  // ---- impressão ----
  // Semanas (segunda a domingo) que tocam o mês, cortadas no primeiro e no último dia do mês.
  function semanasDoMes(ano, mes) {
    const dias = diasDoMes(ano, mes);
    const semanas = [];
    for (const d of dias) {
      const { inicio } = periodo('semanal', d);
      const ultima = semanas[semanas.length - 1];
      if (!ultima || ultima.chave !== inicio) semanas.push({ chave: inicio, inicio: d, fim: d });
      else ultima.fim = d;
    }
    return semanas.map(({ inicio, fim }) => ({ inicio, fim }));
  }
  // Quadradinho da grade do mês: 'marcar', 'nao' (dia fixo que não é desse dia) ou 'fechado' (restaurante fechado).
  function celulaGrade(tarefa, dia, diasAbertos) {
    if (!abre(dia, diasAbertos)) return 'fechado';
    return devidaNoDia(tarefa, dia, diasAbertos) ? 'marcar' : 'nao';
  }
  // Tarefas ativas de um setor ou de uma pessoa, na ordem da tela, com a lista de quem faz cada uma.
  function tarefasParaImprimir(tarefas, tarefaPessoas, { setor, pessoa }) {
    const quem = id => tarefaPessoas.filter(tp => tp.tarefa_id === id).map(tp => tp.pessoa_id);
    const lista = tarefas.filter(t => t.ativo && (!setor || t.setor_id === setor)).map(t => ({ ...t, quem: quem(t.id) }));
    return ordenar(pessoa ? lista.filter(t => t.quem.includes(pessoa)) : lista);
  }

  function formatarDiaLongo(dia) {
    const d = paraData(dia);
    return `${SEMANA[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]}`;
  }
  const nomeDoMes = (ano, mes) => `${MESES[mes - 1]} de ${ano}`;
  function formatarHora(iso) {
    const d = new Date(iso);
    return `${doisDig(d.getHours())}:${doisDig(d.getMinutes())}`;
  }
  const primeiroNome = nome => String(nome || '').trim().split(/\s+/)[0] || '';

  const normalizarUsuario = u => String(u || '').trim().toLowerCase();
  const emailDe = u => `${normalizarUsuario(u)}@${DOMINIO}`;
  function validarPessoa(d, { nova }) {
    if (!String(d.nome || '').trim()) return 'Informe o nome.';
    if (nova && !/^[a-z0-9._-]{2,30}$/.test(normalizarUsuario(d.usuario))) return 'Usuário: 2 a 30 letras minúsculas, números, ponto, traço ou sublinhado, sem espaço nem acento.';
    if ((nova || d.senha) && String(d.senha || '').length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (d.lider && !d.setor_id) return 'Escolha o setor do líder.';
    return null;
  }
  function validarTarefa(t) {
    const titulo = String(t.titulo || '').trim();
    if (!titulo) return 'Escreva a tarefa.';
    if (titulo.length > 120) return 'Tarefa muito longa (máximo 120 caracteres).';
    if (!FREQUENCIAS[t.frequencia]) return 'Escolha a frequência.';
    if (t.frequencia === 'dias' && !(t.dias_semana || []).length) return 'Escolha pelo menos um dia da semana.';
    if (t.horario && !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(t.horario)) return 'Horário inválido.';
    return null;
  }

  const api = {
    VIRADA_HORA, DOMINIO, SEMANA, SEMANA_CURTA, FREQUENCIAS,
    diaOperacional, somarDias, diaDaSemana, periodo, diasDoMes, mesDoDia, somarMeses,
    devidaNoDia, ultimoDiaAberto, trava, faltamParaFechar,
    ehDoDia, hhmm, ordenar, atrasado, progresso, situacaoSetor, estadoNoDia, resumoMes, prazo, descreverFrequencia,
    semanasDoMes, celulaGrade, tarefasParaImprimir,
    formatarDiaLongo, nomeDoMes, formatarHora, primeiroNome,
    normalizarUsuario, emailDe, validarPessoa, validarTarefa,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.Regras = api;
})();
