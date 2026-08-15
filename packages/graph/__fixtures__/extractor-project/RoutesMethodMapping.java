import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class LegacyController {

    // Method-level @RequestMapping must contribute the method path,
    // not overwrite the class-level basePath.
    @RequestMapping("/foo")
    public String foo() {
        return null;
    }

    @GetMapping("/bar")
    public String bar() {
        return null;
    }
}
