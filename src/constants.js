const SPORTS = {
  football: 'Futebol',
  futsal: 'Futsal',
  volleyball: 'Vôlei',
  street_run: 'Corrida de rua',
};

const FORMATS = {
  round_robin: 'Pontos corridos',
  knockout: 'Mata-mata',
  groups_knockout: 'Grupos + mata-mata',
  individual: 'Prova individual',
};

const ROLES = {
  user: 'Usuário',
  organizer: 'Organizador',
  admin: 'Administrador',
};

const USER_STATUS = {
  active: 'Ativo',
  pending: 'Pendente',
  suspended: 'Suspenso',
};

/** Status shown to people; "open" and "in_progress" are derived from the dates of an active championship. */
const CHAMPIONSHIP_DISPLAY_STATUS = {
  open: 'Em inscrição',
  in_progress: 'Em andamento',
  finished: 'Encerrado',
  cancelled: 'Cancelado',
};

/** Championships of these sports take teams; street runs take individual registrations. */
const TEAM_SPORTS = ['football', 'futsal', 'volleyball'];

const REGISTRATION_STATUS = {
  pending: 'Pendente',
  approved: 'Aprovada',
  refused: 'Recusada',
  cancelled: 'Cancelada',
  waitlist: 'Lista de espera',
};

/** Statuses that still hold (or wait for) a place in the category. */
const OPEN_REGISTRATION_STATUSES = ['pending', 'approved', 'waitlist'];

const MAX_ATHLETES = 30;

/** Shown for a match: "finished" is derived (a scheduled match with a result). */
const MATCH_STATUS = {
  scheduled: 'Agendado',
  finished: 'Encerrado',
  cancelled: 'Cancelado',
};

const RACE_STATUS = {
  scheduled: 'Agendada',
  cancelled: 'Cancelada',
};

const DEFAULT_POINTS = { win: 3, draw: 1, loss: 0 };
const DEFAULT_MATCH_MINUTES = 60;
const MAX_GROUP_SIZE = 4;

const LOCKOUT = { maxAttempts: 5, minutes: 15 };
const RESET_TOKEN_TTL_MINUTES = 60;

const MESSAGES = {
  required: 'Campo obrigatório.',
  emailInvalid: 'Informe um e-mail válido.',
  emailTaken: 'Este e-mail já está cadastrado.',
  passwordShort: 'A senha deve ter no mínimo 8 caracteres.',
  passwordMismatch: 'As senhas não conferem.',
  documentInvalid: 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos).',
  registeredUser: 'Cadastro realizado com sucesso. Faça login para continuar.',
  registeredOrganizer: 'Cadastro realizado. Sua conta de organizador aguarda validação de um administrador.',
  loginInvalid: 'E-mail ou senha inválidos.',
  loginLocked: 'Conta bloqueada temporariamente. Tente novamente em 15 minutos.',
  loginSuspended: 'Conta suspensa. Entre em contato com a administração.',
  loggedOut: 'Você saiu da sua conta.',
  pendingNotice: 'Sua conta de organizador aguarda validação de um administrador.',
  forgotSent: 'Se o e-mail estiver cadastrado, você receberá um link para redefinir a senha.',
  resetDone: 'Senha redefinida com sucesso. Faça login.',
  resetInvalid: 'Link inválido ou expirado.',
  profileSaved: 'Dados atualizados com sucesso.',
  currentPasswordWrong: 'Senha atual incorreta.',
  accountDeleted: 'Sua conta foi excluída.',
  deletePasswordWrong: 'Senha incorreta.',
  userCreated: 'Usuário cadastrado com sucesso.',
  userSaved: 'Usuário atualizado com sucesso.',
  userDeleted: 'Usuário excluído com sucesso.',
  lastAdmin: 'Não é possível excluir o último administrador ativo.',
  lastAdminDemote: 'Não é possível remover o perfil ou suspender o último administrador ativo.',
  forbidden: 'Acesso negado',
  dateInvalid: 'Data inválida. Use DD/MM/AAAA.',
  endBeforeStart: 'A data de término não pode ser anterior à data de início.',
  deadlineAfterStart: 'O prazo de inscrição não pode ser posterior à data de início.',
  individualOnlyRun: 'O formato Prova individual é exclusivo da modalidade Corrida de rua.',
  runOnlyIndividual: 'Corrida de rua aceita apenas o formato Prova individual.',
  slotsInvalid: 'Informe um número inteiro maior que zero.',
  categoriesRequired: 'Informe ao menos uma categoria.',
  pendingBlock: 'Somente organizadores com cadastro validado podem cadastrar campeonatos.',
  champCreated: 'Campeonato cadastrado com sucesso.',
  champSaved: 'Campeonato atualizado com sucesso.',
  champFinished: 'Campeonato encerrado.',
  champCancelled: 'Campeonato cancelado.',
  cancelReasonRequired: 'Informe a justificativa do cancelamento.',
  noResults: 'Nenhum campeonato encontrado.',
  athletesRequired: 'Informe ao menos um atleta.',
  athletesTooMany: `Informe no máximo ${MAX_ATHLETES} atletas.`,
  athleteLineInvalid: (line) => `Linha ${line}: use o formato Nome; número.`,
  athleteNumberRepeated: (line) => `Linha ${line}: número já usado por outro atleta.`,
  teamSportInvalid: 'Escolha Futebol, Futsal ou Vôlei.',
  teamNameTaken: 'Você já tem uma equipe com este nome.',
  teamSportLocked: 'A modalidade não pode mudar enquanto a equipe tiver inscrições ativas.',
  teamDeleteBlocked: 'Esta equipe tem inscrição aprovada em campeonato ativo e não pode ser excluída.',
  teamCreated: 'Equipe cadastrada com sucesso.',
  teamSaved: 'Equipe atualizada com sucesso.',
  teamDeleted: 'Equipe excluída.',
  categoryInUse: (name) => `A categoria ${name} tem inscrições e não pode ser removida.`,
  championshipSportLocked: 'A modalidade não pode mudar depois que houver inscrições.',
  registrationClosed: 'As inscrições deste campeonato não estão abertas.',
  registrationOwnChampionship: 'Você não pode inscrever equipes no próprio campeonato.',
  registrationSportMismatch: 'A modalidade da equipe deve ser a mesma do campeonato.',
  registrationDuplicate: 'Esta inscrição já foi feita nesta categoria.',
  registrationFull: 'As vagas desta categoria estão esgotadas.',
  registrationReviewClosed: 'Este campeonato não aceita mais análise de inscrições.',
  registrationAlreadyDecided: 'Esta inscrição já foi analisada.',
  registrationNoSlots: 'Não há vagas disponíveis nesta categoria.',
  refuseReasonRequired: 'Informe a justificativa da recusa.',
  registrationSent: 'Inscrição enviada. Aguarde a análise do organizador.',
  registrationWaitlisted: 'Inscrição registrada na lista de espera.',
  registrationCancelled: 'Inscrição cancelada.',
  registrationCancelClosed: 'O prazo para cancelar esta inscrição terminou.',
  registrationNotCancellable: 'Esta inscrição não pode mais ser cancelada.',
  registrationApproved: 'Inscrição aprovada.',
  registrationRefused: 'Inscrição recusada.',
  pointsInvalid: 'Informe um número inteiro maior ou igual a zero.',
  timeInvalid: 'Horário inválido. Use HH:MM.',
  durationInvalid: 'Informe a duração em minutos (de 10 a 300).',
  intervalInvalid: 'Informe um número de dias entre 1 e 30.',
  dateOutsidePeriod: 'A data deve estar dentro do período do campeonato.',
  matchSameTeams: 'Escolha duas equipes diferentes.',
  matchTeamNotApproved: 'Escolha uma equipe com inscrição aprovada nesta categoria.',
  matchTeamBusy: (team, date, time) => `${team} já tem jogo em ${date} às ${time}.`,
  matchVenueBusy: (date, time) => `O local já tem jogo em ${date} às ${time}.`,
  matchGroupOnlyGroups: 'Grupo só se aplica ao formato Grupos + mata-mata.',
  matchCreated: 'Jogo cadastrado.',
  matchSaved: 'Jogo atualizado.',
  matchCancelled: 'Jogo cancelado.',
  matchHasResult: 'Este jogo já tem resultado e não pode ser cancelado.',
  matchTeamsLocked: 'As equipes não podem mudar depois do resultado.',
  matchNotEditable: 'Jogo cancelado não pode ser alterado.',
  tableClosed: 'Campeonato encerrado ou cancelado: a tabela fica só para consulta.',
  generateNotEnough: 'São necessárias ao menos 2 equipes aprovadas na categoria.',
  generateHasMatches: 'Esta categoria já tem jogos. Cancele-os para gerar a tabela de novo.',
  generateDayFull: 'Os jogos de uma rodada não cabem no mesmo dia. Reduza a duração ou comece mais cedo.',
  generateAfterEnd: 'A última rodada ficaria depois do fim do campeonato. Reduza os dias entre rodadas.',
  generateDone: (n) => `Tabela gerada com ${n} jogos.`,
  knockoutNotReady: 'O mata-mata só pode ser gerado quando todos os jogos dos grupos tiverem resultado.',
  knockoutExists: 'O mata-mata desta categoria já foi gerado.',
  scoreInvalid: 'Informe um número inteiro maior ou igual a zero.',
  knockoutDraw: 'Jogo eliminatório não pode terminar empatado. Informe o placar com o desempate.',
  volleyDraw: 'No vôlei não há empate em sets.',
  volleyPointsBoth: 'Informe os pontos das duas equipes ou deixe os dois em branco.',
  resultTooEarly: 'O resultado só pode ser registrado a partir da data do jogo.',
  resultTeamsMissing: 'As duas equipes do jogo ainda não estão definidas.',
  resultSaved: 'Resultado registrado.',
  resultWinnerLocked: 'O vencedor não pode mudar: o jogo seguinte do mata-mata já tem resultado.',
  raceExists: 'Esta categoria já tem largada cadastrada.',
  raceSaved: 'Largada salva.',
  raceCancelled: 'Largada cancelada.',
  raceTooEarly: 'Os tempos só podem ser registrados a partir da data da largada.',
  finishTimeInvalid: 'Tempo inválido. Use HH:MM:SS.',
  raceTimesSaved: (n) => (n === 1 ? '1 tempo registrado.' : `${n} tempos registrados.`),
  raceNoChanges: 'Nenhum tempo foi alterado.',
};

module.exports = {
  SPORTS, FORMATS, ROLES, USER_STATUS, CHAMPIONSHIP_DISPLAY_STATUS, TEAM_SPORTS, REGISTRATION_STATUS,
  OPEN_REGISTRATION_STATUSES, MAX_ATHLETES, MATCH_STATUS, RACE_STATUS, DEFAULT_POINTS, DEFAULT_MATCH_MINUTES,
  MAX_GROUP_SIZE, LOCKOUT, RESET_TOKEN_TTL_MINUTES, MESSAGES,
};
