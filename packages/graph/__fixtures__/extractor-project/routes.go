package routes

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func RegisterRoutes(r *gin.Engine) {
	r.GET("/api/users", listUsers)
	r.GET("/api/users/:id", getUser)
	r.POST("/api/users", createUser)
	r.PUT("/api/users/:id", updateUser)
	r.DELETE("/api/users/:id", deleteUser)

	r.GET("/api/orders", listOrders)
	r.POST("/api/orders", createOrder)
}

func RegisterHTTPRoutes() {
	http.HandleFunc("/api/health", healthCheck)
}
