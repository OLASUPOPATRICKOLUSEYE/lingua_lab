import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function InsightCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="shadow-none">
      <CardHeader className="space-y-1 pb-0">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
