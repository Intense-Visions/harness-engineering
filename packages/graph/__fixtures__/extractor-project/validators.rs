use validator::Validate;

#[derive(Validate)]
pub struct User {
    #[validate(email)]
    pub email: String,

    #[validate(length(min = 1, max = 255))]
    pub name: String,

    #[validate(range(min = 0, max = 150))]
    pub age: u32,

    #[validate(length(min = 8))]
    pub password: String,
}

#[derive(Validate)]
pub struct Order {
    #[validate(range(min = 0.01, max = 1000000.0))]
    pub amount: f64,

    #[validate(length(equal = 3))]
    pub currency: String,

    #[validate(length(min = 1))]
    pub items: Vec<String>,
}

#[derive(Validate)]
pub struct Address {
    #[validate(length(min = 1))]
    pub street: String,

    #[validate(length(min = 1))]
    pub city: String,

    #[validate(regex(path = "ZIP_RE"))]
    pub zip_code: String,

    #[validate(length(equal = 2))]
    pub country: String,
}
