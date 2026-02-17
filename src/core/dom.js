/* Central DOM registry
   All DOM queries live here.
   Features import from here.
*/

export const DOM = {
  // Auth
  loginContainer: document.getElementById("login-container"),
  appContainer: document.getElementById("app-container"),

  loginForm: document.getElementById("login-form"),
  signupForm: document.getElementById("signup-form"),

  loginUsername: document.getElementById("login-email"),
  loginPassword: document.getElementById("login-password"),
  loginError: document.getElementById("login-error"),

  toast: document.getElementById("toast"),
  loginButton: document.getElementById("login-button"),
  guestHint: document.getElementById("guest-hint"),
  continueGuest: document.getElementById("continue-guest"),


  signupUsername: document.getElementById("signup-username"),
  signupEmail: document.getElementById("signup-email"),
  signupPassword: document.getElementById("signup-password"),
  signupError: document.getElementById("signup-error"),

  showSignup: document.getElementById("show-signup"),
  showLogin: document.getElementById("show-login"),

  logoutButton: document.getElementById("logout-button"),
  currentUser: document.getElementById("current-user"),

  // Workspaces
  prevWorkspace: document.getElementById("prev-workspace"),
  nextWorkspace: document.getElementById("next-workspace"),

  // Timer
  studyInput: document.getElementById("study-duration"),
  breakInput: document.getElementById("break-duration"),
  timerDisplay: document.getElementById("timer-display"),
  timerMessage: document.getElementById("timer-message"),
  startBtn: document.getElementById("start-timer"),
  pauseBtn: document.getElementById("pause-timer"),
  resetBtn: document.getElementById("reset-timer"),
  examModeButton: document.getElementById("exam-mode-button"),
  studyLabelText: document.getElementById("study-label-text"),
  breakLabel: document.getElementById("break-label"),
  strategyButton: document.getElementById("strategy-button"),

  //header buttons / overlays

  strategyOverlay: document.getElementById("strategy-overlay"),
  closeStrategyOverlay: document.getElementById("close-strategy-overlay"),
  strategyList: document.getElementById("strategy-list"),

  // Overlays
  settingsButton: document.getElementById("settings-button"),
  settingsOverlay: document.getElementById("settings-overlay"),
  closeSettingsOverlay: document.getElementById("close-settings-overlay"),
  themeList: document.getElementById("theme-list"),

  // Projects
  projectsList: document.getElementById("projects-list"),
  addProjectButton: document.getElementById("add-project-button"),

  // Stats
  statsContainer: document.getElementById("stats-container"),

  // Modal
  modalOverlay: document.getElementById("modal-overlay"),
  modalTitle: document.getElementById("modal-title"),
  modalInput: document.getElementById("modal-input"),
  modalError: document.getElementById("modal-error"),
  modalOk: document.getElementById("modal-ok"),
  modalCancel: document.getElementById("modal-cancel")

};
