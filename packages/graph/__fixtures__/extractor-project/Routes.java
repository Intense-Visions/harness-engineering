import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class UserController {

    @GetMapping("/users")
    public List<User> listUsers() {
        return null;
    }

    @GetMapping("/users/{id}")
    public User getUser(@PathVariable Long id) {
        return null;
    }

    @PostMapping("/users")
    public User createUser(@RequestBody User user) {
        return null;
    }

    @PutMapping("/users/{id}")
    public User updateUser(@PathVariable Long id, @RequestBody User user) {
        return null;
    }

    @DeleteMapping("/users/{id}")
    public void deleteUser(@PathVariable Long id) {
    }

    @GetMapping("/orders")
    public List<Order> listOrders() {
        return null;
    }

    @PostMapping("/orders")
    public Order createOrder(@RequestBody Order order) {
        return null;
    }
}
