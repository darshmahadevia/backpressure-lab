package main

import (
	"context"
	"errors"
	"flag"
	"log"
	"net/http"
	"os/signal"
	"syscall"
	"time"

	"github.com/darshmahadevia/backpressure-lab/internal/api"
	"github.com/darshmahadevia/backpressure-lab/internal/lab"
)

func main() {
	address := flag.String("address", ":8080", "HTTP listen address")
	flag.Parse()

	engine := lab.NewEngine()
	server := &http.Server{
		Addr:              *address,
		Handler:           api.NewServer(engine),
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	shutdownContext, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go func() {
		<-shutdownContext.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdown); err != nil {
			log.Printf("shutdown API: %v", err)
		}
	}()

	log.Printf("Backpressure Lab API listening on http://localhost%s", *address)
	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatalf("listen: %v", err)
	}
}
