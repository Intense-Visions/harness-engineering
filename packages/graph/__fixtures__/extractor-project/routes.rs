use actix_web::{get, post, put, delete, web, HttpResponse};

#[get("/api/users")]
async fn list_users() -> HttpResponse {
    HttpResponse::Ok().finish()
}

#[get("/api/users/{id}")]
async fn get_user(id: web::Path<u32>) -> HttpResponse {
    HttpResponse::Ok().finish()
}

#[post("/api/users")]
async fn create_user() -> HttpResponse {
    HttpResponse::Created().finish()
}

#[put("/api/users/{id}")]
async fn update_user(id: web::Path<u32>) -> HttpResponse {
    HttpResponse::Ok().finish()
}

#[delete("/api/users/{id}")]
async fn delete_user(id: web::Path<u32>) -> HttpResponse {
    HttpResponse::Ok().finish()
}

#[get("/api/orders")]
async fn list_orders() -> HttpResponse {
    HttpResponse::Ok().finish()
}

#[post("/api/orders")]
async fn create_order() -> HttpResponse {
    HttpResponse::Created().finish()
}
