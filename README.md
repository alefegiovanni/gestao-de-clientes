# Sistema de Gestão de Vendas de Consórcios (Porto)

Sistema web profissional e responsivo para gerenciamento e acompanhamento de vendas de consórcios, com persistência real em banco de dados SQLite e interface moderna nas cores verde, branco e cinza.

---

## 🚀 Como Iniciar o Sistema

### Pré-requisitos
- Node.js instalado (v16 ou superior).

### Instalação e Execução
Na pasta raiz do projeto:

```bash
# Instalar dependências (caso seja a primeira vez)
npm install

# Iniciar o servidor
npm start
```

O sistema estará acessível em seu navegador no endereço:
**`http://localhost:3000`**

---

## 📋 Módulos e Funcionalidades

1. **Dashboard**
   - **Card 1 – Vendas no mês**: Soma do valor dos créditos vendidos no mês atual.
   - **Card 2 – Quantidade de vendas**: Contagem total de vendas cadastradas.
   - **Card 3 – Ticket médio**: Média automática do valor dos créditos vendidos.
   - **Card 4 – Clientes cadastrados**: Quantidade total de clientes únicos cadastrados.

2. **Nova Venda**
   - Formulário com os 9 campos obrigatórios:
     - Data da venda (padrão brasileiro `DD/MM/AAAA`)
     - Mês da venda (identificado automaticamente pela data da venda)
     - Nome do cliente
     - Valor do crédito (formatação monetária `R$`)
     - Número do contrato (com validação anti-duplicidade)
     - Número do grupo
     - Número da cota
     - Forma de pagamento (seleção dinâmica)
     - Forma de captação (seleção dinâmica)

3. **Clientes**
   - Exibição de: Nome do cliente, Número do contrato, Número da cota, Número do grupo, Valor do crédito e Data da venda.
   - Pesquisa estrita por **nome do cliente** ou **número do contrato**.

4. **Contratos**
   - Exibição de: Número do contrato, Nome do cliente, Valor do crédito, Número da cota, Número do grupo, Data da venda e Forma de pagamento.
   - Pesquisa estrita por **número do contrato** ou **nome do cliente**.

5. **Relatórios e Indicadores**
   - **Total vendido no mês**: Soma dos créditos para o mês e ano selecionados.
   - **Total geral vendido**: Soma acumulada de todos os registros históricos.

6. **Vendas por Mês**
   - Tabela organizada por competência selecionada, exibindo todos os detalhes da venda e o total consolidado do período.

7. **Configurações**
   - Gerenciamento de opções de Formas de Pagamento e Formas de Captação.

---

## 🗄️ Estrutura do Banco de Dados

O banco de dados relacional (`consorcios.db`) implementa integridade referencial com chaves estrangeiras:
- `clientes` (nome único)
- `grupos` (número único)
- `cotas` (número único por grupo)
- `contratos` (número único, associado ao cliente)
- `pagamentos` (formas de pagamento)
- `captacoes` (formas de captação)
- `vendas` (relacionamento central com valores, competência e datas)

