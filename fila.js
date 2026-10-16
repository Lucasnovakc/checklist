// Fila das marcações feitas sem internet. Fica guardada no aparelho e é reenviada na ordem quando a conexão volta.
// Uma op por item e tipo: a última vontade vale.
(function () {
  const mesma = (a, b) => a.item === b.item && a.tipo === b.tipo;

  function criarFila(armazenamento, chave) {
    function ler() {
      try { return JSON.parse(armazenamento.getItem(chave) || '[]'); } catch { return []; }
    }
    function gravar(lista) {
      try { armazenamento.setItem(chave, JSON.stringify(lista)); } catch {} // sem armazenamento: só não guarda
    }
    function adicionar(op) {
      const lista = ler().filter(o => !mesma(o, op));
      lista.push(op);
      gravar(lista);
    }
    // Remove só se ainda for exatamente a mesma vontade (pode ter mudado durante o envio).
    function remover(op) {
      gravar(ler().filter(o => !(mesma(o, op) && o.valor === op.valor && o.em === op.em)));
    }

    let enviando = null;
    // enviar(op) devolve promessa. Erro com .rede/.sessao: para e tenta depois. Outro erro: descarta e devolve.
    function enviarTudo(enviar) {
      if (enviando) return enviando;
      enviando = (async () => {
        const recusadas = [];
        for (const op of ler()) {
          try { await enviar(op); remover(op); }
          catch (erro) {
            if (erro && (erro.rede || erro.sessao)) break;
            remover(op);
            recusadas.push({ op, erro });
          }
        }
        return recusadas;
      })().finally(() => { enviando = null; });
      return enviando;
    }

    return { adicionar, pendentes: ler, tamanho: () => ler().length, enviarTudo };
  }

  // Mostra na tela o que ainda não chegou ao servidor (fila sem internet e envios em andamento).
  function aplicarPendentes(itens, ops, eu) {
    if (!ops.length) return itens;
    return itens.map(i => {
      let x = i;
      for (const op of ops) {
        if (op.item !== i.id) continue;
        if (op.tipo === 'marcar') {
          if (op.valor && x.estado !== 'feito') x = { ...x, estado: 'feito', feito_em: op.em, marcado_por: eu.id, marcado_por_nome: eu.nome, motivo_liberacao: null };
          if (!op.valor) x = { ...x, estado: 'pendente', feito_em: null, marcado_por: null, marcado_por_nome: null };
        }
        if (op.tipo === 'anotar') x = { ...x, observacao: op.valor || null };
      }
      return x;
    });
  }

  const api = { criarFila, aplicarPendentes };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.Fila = api;
})();
