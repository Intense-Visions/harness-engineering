from fastapi import FastAPI, APIRouter

app = FastAPI()
router = APIRouter()


@app.get("/api/users")
async def list_users():
    pass


@app.get("/api/users/{user_id}")
async def get_user(user_id: int):
    pass


@app.post("/api/users")
async def create_user():
    pass


@app.put("/api/users/{user_id}")
async def update_user(user_id: int):
    pass


@app.delete("/api/users/{user_id}")
async def delete_user(user_id: int):
    pass


@router.get("/api/orders")
async def list_orders():
    pass


@router.post("/api/orders")
async def create_order():
    pass
