use axum::{routing::get, Router};

async fn root() -> &'static str {
    "Hello, world!"
}

#[tokio::main]
async fn main() {
    let app = Router::new().route("/", get(root));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
