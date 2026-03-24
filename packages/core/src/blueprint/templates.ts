export const SHELL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Blueprint: <%= projectName %></title>
    <style><%- styles %></style>
</head>
<body>
    <div id="app">
        <header>
            <h1>Blueprint: <%= projectName %></h1>
            <p>Generated at: <%= generatedAt %></p>
        </header>
        <main>
            <section class="modules">
                <% modules.forEach(module => { %>
                    <article class="module" id="<%= module.id %>">
                        <h2><%= module.title %></h2>
                        <p><%= module.description %></p>
                    </article>
                <% }) %>
            </section>
        </main>
    </div>
    <script><%- scripts %></script>
</body>
</html>
`;

export const STYLES = `
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; margin: 0; padding: 20px; color: #333; }
header { border-bottom: 2px solid #eee; margin-bottom: 20px; padding-bottom: 10px; }
.module { background: #f9f9f9; border: 1px solid #ddd; padding: 15px; margin-bottom: 15px; border-radius: 4px; }
.module h2 { margin-top: 0; color: #0066cc; }
`;

export const SCRIPTS = `
console.log('Blueprint player initialized.');
`;
