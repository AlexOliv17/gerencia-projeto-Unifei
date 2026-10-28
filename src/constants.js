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
};

module.exports = {
  SPORTS, FORMATS, ROLES, USER_STATUS, CHAMPIONSHIP_DISPLAY_STATUS, LOCKOUT, RESET_TOKEN_TTL_MINUTES, MESSAGES,
};
