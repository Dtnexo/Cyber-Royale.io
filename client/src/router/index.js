import { createRouter, createWebHistory } from "vue-router";
import LoginView from "../views/LoginView.vue";
import DashboardView from "../views/DashboardView.vue";
import GameView from "../views/GameView.vue";
import HeroesView from "../views/HeroesView.vue";
import LeaderboardView from "../views/LeaderboardView.vue";
import AdminView from "../views/AdminView.vue";
import SettingsView from "../views/SettingsView.vue";
import ForceResetView from "../views/ForceResetView.vue";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: "/login",
      name: "login",
      component: LoginView,
    },
    {
      path: "/",
      redirect: "/dashboard",
    },
    {
      path: "/dashboard",
      name: "dashboard",
      component: DashboardView,
      meta: { requiresAuth: true },
    },
    {
      path: "/heroes",
      name: "heroes",
      component: HeroesView,
      meta: { requiresAuth: true },
    },
    {
      path: "/leaderboard",
      name: "leaderboard",
      component: LeaderboardView,
      meta: { requiresAuth: true },
    },
    {
      path: "/play",
      name: "play",
      component: GameView,
      meta: { requiresAuth: true },
    },
    {
      path: "/admin",
      name: "admin",
      component: AdminView,
      meta: { requiresAuth: true }, // Logic handled in component
    },
    {
      path: "/settings",
      name: "settings",
      component: SettingsView,
      component: SettingsView,
      meta: { requiresAuth: true },
    },
    {
      path: "/force-reset",
      name: "force-reset",
      component: ForceResetView,
      meta: { requiresAuth: true },
    },
  ],
});

// Simple Route Guard
router.beforeEach((to, from, next) => {
  const publicPages = ["/login"];
  const authRequired = !publicPages.includes(to.path);
  const loggedIn = localStorage.getItem("token");

  if (authRequired && !loggedIn) {
    return next("/login");
  }

  // FORCE RESET CHECK
  if (loggedIn) {
    const user = JSON.parse(localStorage.getItem("user_cache") || "{}"); // Basic check, ideally use store
    // Note: If accessing /force-reset, allow it. If accessing others, check flag.
    // Getting the store here might be tricky due to circular deps if not careful.
    // Use auth store in component or trust the login redirect for now.
  }

  next();
});

export default router;
