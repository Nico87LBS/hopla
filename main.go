package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/nico87lbs/hopla/config"
	docs "github.com/nico87lbs/hopla/docs"
	"github.com/nico87lbs/hopla/frontend"
	auth "github.com/nico87lbs/hopla/internal/auth"
	"github.com/nico87lbs/hopla/internal/calendar"
	calRepo "github.com/nico87lbs/hopla/internal/calendar/repo"
	"github.com/nico87lbs/hopla/internal/chore"
	chRepo "github.com/nico87lbs/hopla/internal/chore/repo"
	"github.com/nico87lbs/hopla/internal/circle"
	cRepo "github.com/nico87lbs/hopla/internal/circle/repo"
	"github.com/nico87lbs/hopla/internal/database"
	"github.com/nico87lbs/hopla/internal/email"
	gamesAPI "github.com/nico87lbs/hopla/internal/games/api"
	label "github.com/nico87lbs/hopla/internal/label"
	lRepo "github.com/nico87lbs/hopla/internal/label/repo"
	learnAPI "github.com/nico87lbs/hopla/internal/learn/api"
	"github.com/nico87lbs/hopla/internal/mfa"
	pointsAPI "github.com/nico87lbs/hopla/internal/points/api"
	"github.com/nico87lbs/hopla/internal/project"
	pjRepo "github.com/nico87lbs/hopla/internal/project/repo"
	reward "github.com/nico87lbs/hopla/internal/reward"
	rwRepo "github.com/nico87lbs/hopla/internal/reward/repo"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	pRepo "github.com/nico87lbs/hopla/internal/points/repo"
	"github.com/nico87lbs/hopla/internal/realtime"
	"github.com/nico87lbs/hopla/internal/resource"
	"github.com/nico87lbs/hopla/internal/storage"
	storageRepo "github.com/nico87lbs/hopla/internal/storage/repo"
	spRepo "github.com/nico87lbs/hopla/internal/subtask/repo"
	dsync "github.com/nico87lbs/hopla/internal/sync"
	"github.com/nico87lbs/hopla/internal/user"
	uRepo "github.com/nico87lbs/hopla/internal/user/repo"
	"github.com/nico87lbs/hopla/internal/utils"
	"github.com/nico87lbs/hopla/internal/zone"
	"github.com/nico87lbs/hopla/logging"
	"github.com/nico87lbs/hopla/migrations"
	"go.uber.org/fx"
	"gorm.io/gorm"

	"github.com/nico87lbs/hopla/internal/filter"
	fRepo "github.com/nico87lbs/hopla/internal/filter/repo"
)

func main() {
	// Load configuration first
	cfg := config.LoadConfig()

	// Configure logging from application config
	logging.SetConfigFromAppConfig(
		cfg.Logging.Level,
		cfg.Logging.Encoding,
		cfg.Logging.Development,
	)
	app := fx.New(
		// Startup runs DB migrations synchronously in an OnStart hook. On large
		// datasets the backfill migrations take well over fx's 15s default,
		// which would abort startup and crash-loop. Give them room to finish.
		fx.StartTimeout(15*time.Minute),
		fx.Supply(cfg),
		fx.Supply(logging.DefaultLogger().Desugar()),

		// fx.Provide(config.NewConfig),
		fx.Provide(auth.NewAuthMiddleware),
		fx.Provide(auth.APITokenMiddleware),
		fx.Provide(auth.NewMultiAuthMiddleware),
		fx.Provide(auth.NewIdentityProvider),
		fx.Provide(resource.NewHandler),

		// fx.Provide(NewBot),
		fx.Provide(database.NewDatabase),
		fx.Provide(chRepo.NewChoreRepository),
		fx.Provide(chore.NewHandler),
		fx.Provide(calendar.NewHandler),
		fx.Provide(calRepo.NewCalendarRepository),
		fx.Provide(uRepo.NewUserRepository),
		fx.Provide(user.NewDeletionService),
		fx.Provide(user.NewHandler),
		fx.Provide(cRepo.NewCircleRepository),
		fx.Provide(circle.NewHandler),

		// Rate limiter
		fx.Provide(utils.NewRateLimiter),

		// add email sender (implementation selected by email.provider config):
		fx.Provide(email.NewSender),

		// MFA services
		fx.Provide(mfa.NewService),
		fx.Provide(mfa.NewCleanupService),

		// Auth services
		fx.Provide(auth.NewTokenService),
		fx.Provide(auth.NewCleanupService),

		// add handlers also
		fx.Provide(newServer),

		// points
		fx.Provide(pRepo.NewPointsRepository),
		fx.Provide(spRepo.NewSubTasksRepository),

		// Labels:
		fx.Provide(lRepo.NewLabelRepository),
		fx.Provide(label.NewHandler),

		// Rewards:
		fx.Provide(rwRepo.NewRewardRepository),
		fx.Provide(reward.NewHandler),
		fx.Provide(pointsAPI.NewHandler),
		fx.Provide(gamesAPI.NewHandler),
		fx.Provide(learnAPI.NewHandler),

		// Projects:
		fx.Provide(pjRepo.NewProjectRepository),
		fx.Provide(project.NewHandler),

		// Filters:
		fx.Provide(fRepo.NewFilterRepository),
		fx.Provide(filter.NewHandler),

		fx.Provide(chore.NewAPI),

		// Sync:
		fx.Provide(dsync.NewHandler),

		// Frontend
		fx.Provide(frontend.NewHandler),

		// Docs
		fx.Provide(docs.NewHandler),

		// storage: factory selects local vs S3 based on config.Storage.StorageType.
		// Set storage_type: "local" in config for local dev, leave blank for S3.
		fx.Provide(storage.NewStorage),
		fx.Provide(storage.NewURLSigner),
		fx.Provide(storage.NewHandler),
		fx.Provide(storage.NewDraftCleanupService),
		fx.Provide(storageRepo.NewStorageRepository),

		// backup service
		// fx.Provide(backup.NewService),
		// fx.Provide(backup.NewHandler),

		// Real-time service and components
		fx.Provide(realtime.NewRealTimeService),
		fx.Provide(realtime.NewTicketStore),
		fx.Provide(realtime.NewAuthMiddleware),
		fx.Provide(realtime.NewPollingHandler),

		// MCP server

		// fx.Invoke(RunApp),
		fx.Invoke(
			zone.Init,
			chore.Routes,
			calendar.Routes,
			chore.APIs,
			user.Routes,
			circle.Routes,
			label.Routes,
			reward.Routes,
			reward.APIs,
			pointsAPI.Routes,
			pointsAPI.APIs,
			gamesAPI.Routes,
			gamesAPI.APIs,
			learnAPI.Routes,
			project.Routes,
			filter.Routes,

			storage.Routes,
			frontend.Routes,
			docs.Routes,
			resource.Routes,
			// backup.Routes,

			dsync.Routes,
			realtime.Routes, // (router, rtAuthMiddleware, pollingHandler, jwtAuth)

			func(r *gin.Engine) {},
		),
	)

	if err := app.Err(); err != nil {
		log.Fatal(err)
	}

	app.Run()

}

func newServer(lc fx.Lifecycle, cfg *config.Config, db *gorm.DB, mfaCleanup *mfa.CleanupService, authCleanup *auth.CleanupService, rts *realtime.RealTimeService, draftCleanup *storage.DraftCleanupService, ticketStore *realtime.TicketStore) *gin.Engine {
	// Set Gin mode based on logging configuration
	if cfg.Logging.Development || strings.ToLower(cfg.Logging.Level) == "debug" {
		gin.SetMode(gin.DebugMode)
	} else {
		gin.SetMode(gin.ReleaseMode)
	}

	// log when http request is made:

	r := gin.New()

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Server.Port),
		Handler:      r,
		ReadTimeout:  cfg.Server.ReadTimeout,
		WriteTimeout: cfg.Server.WriteTimeout,
	}

	corsConfig := cors.DefaultConfig()
	allowOrigins := make(map[string]bool)
	for _, origin := range cfg.Server.CorsAllowOrigins {
		allowOrigins[origin] = true
	}
	corsConfig.AllowOriginFunc = func(origin string) bool {
		return allowOrigins[origin]
	}

	corsConfig.AllowCredentials = true
	// Add all headers that browsers commonly send
	corsConfig.AddAllowHeaders(
		"Authorization",
		"secretkey",
		"Cache-Control",
		"Content-Type",
		"Accept",
		"Sec-Ch-Ua",
		"Sec-Ch-Ua-Mobile",
		"Sec-Ch-Ua-Platform",
		"User-Agent",
		"Referer",
		"X-Impersonate-User-ID",
		"refresh_token",
	)
	// Expose headers that the frontend might need
	corsConfig.AddExposeHeaders("Content-Type")
	r.Use(cors.New(corsConfig))
	r.Use(realtime.ChangeNotifier(rts))

	lc.Append(fx.Hook{
		OnStart: func(ctx context.Context) error {
			if cfg.Database.Migration {
				database.Migration(db)
				migrations.Run(context.Background(), db)
				err := database.MigrationScripts(db, cfg)
				if err != nil {
					panic(err)
				}
			}
			mfaCleanup.Start(context.Background())
			authCleanup.Start(context.Background())
			draftCleanup.Start(context.Background())

			// Start real-time service
			if err := rts.Start(ctx); err != nil {
				log.Printf("Failed to start real-time service: %v", err)
			}

			go func() {
				if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
					log.Fatalf("listen: %s\n", err)
				}
			}()
			return nil
		},
		OnStop: func(ctx context.Context) error {
			// Stop real-time service first with timeout
			done := make(chan error, 1)
			go func() {
				done <- rts.Stop()
			}()

			select {
			case err := <-done:
				if err != nil {
					log.Printf("Failed to stop real-time service: %v", err)
				}
			case <-time.After(5 * time.Second):
				log.Printf("Real-time service shutdown timeout, forcing shutdown")
			}

			mfaCleanup.Stop()
			authCleanup.Stop()
			draftCleanup.Stop()

			// Stop the SSE ticket store cleanup goroutine
			ticketStore.Stop()

			// Shutdown HTTP server with timeout
			shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()

			if err := srv.Shutdown(shutdownCtx); err != nil {
				log.Printf("Server shutdown timeout: %s", err)
				// Force close
				srv.Close()
			}
			return nil
		},
	})

	// Simple health-check endpoint
	r.GET("/api/v1/health", func(c *gin.Context) {
		c.Status(http.StatusOK) // 200 - OK if server started
	})

	return r
}
