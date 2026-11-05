/**
 * @file constants.js
 * @description Centraliza todas as constantes de UI utilizadas no painel REVIVE.
 *
 * Agrupa em um unico modulo:
 * - **Classes Tailwind CSS compostas** (`glassSurface`, `fieldBase`, `pillBase`) que
 *   padronizam a aparencia glassmorphism do design system.
 * - **Configuracoes de animacao Framer Motion** (`navButtonMotion`, `cardMotion`,
 *   `staggerContainer`, `screenTransition`, etc.) para manter consistencia de
 *   micro-interacoes em todo o aplicativo.
 * - **Definicoes de humor** (`moodColors`, `moodOptions`) com cores e emojis
 *   associados a cada nivel de bem-estar do usuario.
 * - **Definicoes de badges/conquistas** (`badgeDefinitions`) que descrevem os
 *   marcos de progresso: streaks, economia, metas e consistencia de registros.
 *
 * @module utils/constants
 */

// ──────────────────────────────────────────────
// Classes CSS compostas (Tailwind)
// ──────────────────────────────────────────────

/**
 * Classe CSS de superficie principal com efeito glass (glassmorphism).
 *
 * Aplica fundo semi-transparente escuro, borda sutil e sombra profunda.
 * Usada em cards, paineis e modais ao longo de todo o painel.
 *
 * @type {string}
 */
export const glassSurface = 'surface-card';

/**
 * Variante mais discreta da superficie glass, com menor opacidade de fundo e borda.
 *
 * Ideal para elementos secundarios que nao devem competir visualmente com o
 * conteudo principal.
 *
 * @type {string}
 */
export const glassMutedSurface = 'surface-muted';

/**
 * Classes base para campos de formulario (inputs, textareas, selects).
 *
 * Inclui padding, borda arredondada, fundo escuro, cor do texto branca,
 * placeholder translucido e estado de foco com cor accent (#5CC8FF).
 *
 * @type {string}
 */
export const fieldBase = 'field-control';

/**
 * Classes base para pills/badges inline.
 *
 * Componente compacto com layout flex, espacamento, cantos totalmente
 * arredondados e tipografia em tamanho extra-pequeno (xs).
 *
 * @type {string}
 */
export const pillBase = 'inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold border hairline surface-muted';

// ──────────────────────────────────────────────
// Configuracoes de animacao (Framer Motion)
// ──────────────────────────────────────────────

/**
 * Configuracao de animacao para botoes de navegacao.
 *
 * Aplica um leve aumento de escala no hover e uma reducao sutil no tap,
 * proporcionando feedback tatil ao usuario.
 *
 * @type {{ whileHover: { scale: number }, whileTap: { scale: number } }}
 */
export const navButtonMotion = {
  whileHover: { scale: 1.01 },
  whileTap: { scale: 0.98 }
};

/**
 * Configuracao de animacao para cards interativos.
 *
 * No hover, o card sobe 6px e ganha uma sombra mais pronunciada,
 * usando transicao do tipo spring para um movimento organico.
 *
 * @type {{ whileHover: { y: number, boxShadow: string }, transition: { type: string, stiffness: number, damping: number } }}
 */
export const cardMotion = {
  whileHover: { y: -3, boxShadow: '0 24px 54px rgba(2, 6, 23, 0.28)' },
  transition: { type: 'spring', stiffness: 260, damping: 25 }
};

/**
 * Configuracao de animacao para botoes de acao accent (CTAs).
 *
 * Comportamento identico ao `navButtonMotion` — leve scale no hover/tap.
 *
 * @type {{ whileHover: { scale: number }, whileTap: { scale: number } }}
 */
export const accentButtonMotion = {
  whileHover: { scale: 1.01 },
  whileTap: { scale: 0.98 }
};

/**
 * Container pai para animacao stagger em grids/listas.
 *
 * Inicia com opacidade 0 (hidden) e revela os filhos sequencialmente
 * com intervalo de 80ms entre cada item (`staggerChildren: 0.08`).
 *
 * @type {{ hidden: { opacity: number }, show: { opacity: number, transition: { staggerChildren: number } } }}
 * @see staggerItem
 */
export const staggerContainer = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 }
  }
};

/**
 * Variantes de animacao para cada item filho dentro de um `staggerContainer`.
 *
 * Cada item entra com fade-in e deslizamento vertical de 20px, usando
 * transicao spring para suavidade.
 *
 * @type {{ hidden: { opacity: number, y: number }, show: { opacity: number, y: number, transition: Object } }}
 * @see staggerContainer
 */
export const staggerItem = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 25 } }
};

/**
 * Configuracao de transicao para mudanca de pagina/tela.
 *
 * Combina fade com leve deslizamento vertical (12px) na entrada e saida,
 * com duracao de 300ms e easing `easeOut`.
 *
 * @type {{ initial: Object, animate: Object, exit: Object, transition: { duration: number, ease: string } }}
 */
export const screenTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
  transition: { duration: 0.3, ease: 'easeOut' }
};

// ──────────────────────────────────────────────
// Mapeamento visual de KPIs
// ──────────────────────────────────────────────

/**
 * Mapeamento de cores de borda para KPI cards.
 *
 * Cada chave corresponde a uma cor semantica (emerald, cyan, yellow, red)
 * e todas atualmente resolvem para a mesma borda sutil em slate,
 * mantendo uniformidade visual nos indicadores.
 *
 * @type {Object.<string, string>}
 */
export const kpiBorderMap = {
  emerald: 'border-emerald-400/25',
  cyan: 'border-sky-400/25',
  yellow: 'border-amber-400/25',
  red: 'border-rose-400/25'
};

// ──────────────────────────────────────────────
// Definicoes de humor (Mood)
// ──────────────────────────────────────────────

/**
 * Mapeamento de humores para cores hexadecimais.
 *
 * Usado em graficos (DonutChart) e indicadores visuais para colorir
 * cada nivel de humor do usuario de forma consistente.
 *
 * @type {Object.<string, string>}
 */
export const moodColors = {
  excelente: '#10b981',
  bom: '#3b82f6',
  neutro: '#8b5cf6',
  ruim: '#f59e0b',
  'péssimo': '#ef4444'
};

/**
 * Lista de opcoes de humor disponiveis para selecao pelo usuario.
 *
 * Cada opcao contem um valor interno (`value`), um rotulo de exibicao
 * (`label`) e um emoji representativo. Ordenadas da melhor para a
 * pior percepcao de bem-estar.
 *
 * @type {Array<{ value: string, label: string, emoji: string }>}
 */
export const moodOptions = [
  { value: 'excelente', label: 'Excelente', emoji: '😄' },
  { value: 'bom', label: 'Bom', emoji: '🙂' },
  { value: 'neutro', label: 'Neutro', emoji: '😐' },
  { value: 'ruim', label: 'Ruim', emoji: '😟' },
  { value: 'péssimo', label: 'Péssimo', emoji: '😢' }
];

// ──────────────────────────────────────────────
// Definicoes de Badges / Conquistas
// ──────────────────────────────────────────────

/**
 * Definicoes completas de todas as conquistas (badges) do sistema REVIVE.
 *
 * Organizadas em quatro categorias:
 * - **streak**: marcos de dias consecutivos de abstinencia (1d, 7d, 30d, 90d, 180d, 365d).
 * - **savings**: marcos de economia acumulada em reais (R$50, R$100, R$500, R$1.000).
 * - **goals**: marcos de metas concluidas (1, 5, 10).
 * - **consistency**: marcos de registros diarios preenchidos (7, 30).
 *
 * Cada badge possui:
 * - `id` — identificador unico (ex: 'streak-7').
 * - `category` — categoria para agrupamento.
 * - `name` / `description` — textos exibidos ao usuario.
 * - `icon` — nome do icone Lucide React correspondente.
 * - `requirement` — valor numerico minimo para desbloqueio.
 * - `color` — cor hex para destaque visual do badge.
 *
 * @type {Array<{ id: string, category: string, name: string, description: string, icon: string, requirement: number, color: string }>}
 */
export const badgeDefinitions = [
  // Streak badges
  { id: 'streak-1', category: 'streak', name: '1 dia consecutivo', description: 'Primeiro dia de abstinência', icon: 'Flame', requirement: 1, color: '#7CF6C4' },
  { id: 'streak-7', category: 'streak', name: '1 Semana', description: '7 dias consecutivos', icon: 'Flame', requirement: 7, color: '#35D3FF' },
  { id: 'streak-30', category: 'streak', name: '1 mês', description: '30 dias consecutivos', icon: 'Flame', requirement: 30, color: '#8b5cf6' },
  { id: 'streak-90', category: 'streak', name: '3 Meses', description: '90 dias consecutivos', icon: 'Flame', requirement: 90, color: '#f59e0b' },
  { id: 'streak-180', category: 'streak', name: '6 Meses', description: '180 dias consecutivos', icon: 'Flame', requirement: 180, color: '#ef4444' },
  { id: 'streak-365', category: 'streak', name: '1 Ano', description: '365 dias consecutivos', icon: 'Flame', requirement: 365, color: '#ec4899' },
  // Savings badges
  { id: 'savings-50', category: 'savings', name: 'R$50 Economizados', description: 'R$ 50 de economia estimada acumulada', icon: 'DollarSign', requirement: 50, color: '#7CF6C4' },
  { id: 'savings-100', category: 'savings', name: 'R$100 Economizados', description: 'R$ 100 de economia estimada acumulada', icon: 'DollarSign', requirement: 100, color: '#35D3FF' },
  { id: 'savings-500', category: 'savings', name: 'R$500 Economizados', description: 'R$ 500 de economia estimada acumulada', icon: 'DollarSign', requirement: 500, color: '#8b5cf6' },
  { id: 'savings-1000', category: 'savings', name: 'R$1.000 Economizados', description: 'R$ 1.000 de economia estimada acumulada', icon: 'DollarSign', requirement: 1000, color: '#f59e0b' },
  // Goal badges
  { id: 'goal-first', category: 'goals', name: 'Primeira Meta', description: 'Concluiu a primeira meta', icon: 'Target', requirement: 1, color: '#7CF6C4' },
  { id: 'goal-5', category: 'goals', name: '5 Metas', description: 'Concluiu 5 metas', icon: 'Target', requirement: 5, color: '#35D3FF' },
  { id: 'goal-10', category: 'goals', name: '10 Metas', description: 'Concluiu 10 metas', icon: 'Target', requirement: 10, color: '#8b5cf6' },
  // Consistency badges
  { id: 'log-7', category: 'consistency', name: '7 dias com check-in', description: '7 datas distintas com check-in', icon: 'BookOpen', requirement: 7, color: '#7CF6C4' },
  { id: 'log-30', category: 'consistency', name: '30 dias com check-in', description: '30 datas distintas com check-in', icon: 'BookOpen', requirement: 30, color: '#35D3FF' },
];
