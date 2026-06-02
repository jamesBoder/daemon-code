package handlers

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/jamesboder/daemon-code/internal/db"
	"github.com/jamesboder/daemon-code/internal/services/password"
)

type registerRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Timezone string `json:"timezone"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type authResponse struct {
	Token              string `json:"token"`
	OnboardingComplete bool   `json:"onboarding_complete"`
	Timezone           string `json:"timezone"`
}

func (h *handler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	if req.Email == "" || req.Password == "" {
		respondWithError(w, http.StatusBadRequest, "email and password required")
		return
	}
	if err := password.ValidatePasswordStrength(req.Password); err != nil {
		respondWithError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.Timezone == "" {
		req.Timezone = "UTC"
	}

	hash, err := password.HashPassword(req.Password)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not hash password")
		return
	}

	user, err := h.q.CreateUser(r.Context(), db.CreateUserParams{
		Email:        req.Email,
		PasswordHash: hash,
		Timezone:     req.Timezone,
	})
	if err != nil {
		respondWithError(w, http.StatusConflict, "email already registered")
		return
	}

	// Create initial shadow profile
	if _, err := h.q.CreateShadowProfile(r.Context(), user.ID); err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not create profile")
		return
	}

	token, err := h.tokens.GenerateToken(user.ID, user.Email)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not generate token")
		return
	}

	respondWithJSON(w, http.StatusCreated, authResponse{
		Token:              token,
		OnboardingComplete: user.OnboardingComplete,
		Timezone:           user.Timezone,
	})
}

func (h *handler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondWithError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	user, err := h.q.GetUserByEmail(r.Context(), strings.ToLower(strings.TrimSpace(req.Email)))
	if err != nil || !password.CheckPasswordHash(req.Password, user.PasswordHash) {
		respondWithError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}

	token, err := h.tokens.GenerateToken(user.ID, user.Email)
	if err != nil {
		respondWithError(w, http.StatusInternalServerError, "could not generate token")
		return
	}

	respondWithJSON(w, http.StatusOK, authResponse{
		Token:              token,
		OnboardingComplete: user.OnboardingComplete,
		Timezone:           user.Timezone,
	})
}

func (h *handler) Refresh(w http.ResponseWriter, r *http.Request) {
	authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	tokenStr := strings.TrimPrefix(authHeader, "Bearer ")

	newToken, err := h.tokens.RefreshToken(tokenStr)
	if err != nil {
		respondWithError(w, http.StatusUnauthorized, "invalid or expired token")
		return
	}

	respondWithJSON(w, http.StatusOK, authResponse{Token: newToken})
}
