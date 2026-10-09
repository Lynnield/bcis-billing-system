import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { getSubscriberById, getSubscriberStatusHistory } from "@/lib/subscriber-api";
import { SubscriberStatusHistoryEntry } from "@/shared/types";
import { ArrowLeft, User, Mail, Phone, MapPin, Calendar, Clock, Loader2 } from "lucide-react";

const statusBadgeVariant: Record<string, "default" | "success" | "warning" | "destructive" | "secondary"> = {
  active: "success",
  inactive: "secondary",
  suspended: "warning",
  disconnected: "destructive",
  pending: "default",
};

interface SubscriberDetailProps {
  subscriberId: number;
  onBack: () => void;
}

export function SubscriberDetail({ subscriberId, onBack }: SubscriberDetailProps) {
  const { data: subscriberData, isLoading: subscriberLoading, error: subscriberError, refetch: refetchSubscriber } = useQuery({
    queryKey: ["subscriber", subscriberId],
    queryFn: () => getSubscriberById(subscriberId),
    enabled: !!subscriberId,
  });

  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ["subscriber-status-history", subscriberId],
    queryFn: () => getSubscriberStatusHistory(subscriberId),
    enabled: !!subscriberId,
  });

  const subscriber = subscriberData?.data;

  if (subscriberLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={onBack} disabled>
            <Loader2 className="h-4 w-4 animate-spin" />
          </Button>
          <div className="h-6 bg-muted rounded w-48" />
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardContent className="p-6">
                <div className="h-4 bg-muted rounded w-1/2 mb-2" />
                <div className="h-8 bg-muted rounded w-3/4" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (subscriberError || !subscriber) {
    return (
      <div className="space-y-4">
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-6 text-center">
          <p className="font-medium text-destructive">Failed to load subscriber</p>
          <p className="text-sm text-muted-foreground mt-1">{subscriberError instanceof Error ? subscriberError.message : "Subscriber not found"}</p>
          <Button onClick={() => refetchSubscriber()} className="mt-4" variant="outline">
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Back to List
        </Button>
        <div className="flex items-center gap-2">
          <Badge variant={statusBadgeVariant[subscriber.status]}>
            {subscriber.status}
          </Badge>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-muted-foreground" />
              Subscriber Details
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Full Name</p>
              <p className="text-lg font-semibold">{subscriber.firstName} {subscriber.lastName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Account Number</p>
              <p className="text-lg font-mono font-semibold">{subscriber.accountNumber}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <Badge variant={statusBadgeVariant[subscriber.status]}>{subscriber.status}</Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Mail className="h-5 w-5 text-muted-foreground" />
              Contact Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{subscriber.contactNumber ?? "Not provided"}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <span>{subscriber.email ?? "Not provided"}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5 text-muted-foreground" />
              Address
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{subscriber.addressLine1}</p>
            {subscriber.addressLine2 && <p>{subscriber.addressLine2}</p>}
            <p>
              {subscriber.city ?? "—"}
              {subscriber.province && `, ${subscriber.province}`}
              {subscriber.postalCode && ` ${subscriber.postalCode}`}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5 text-muted-foreground" />
            Timestamps
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-sm text-muted-foreground">Created At</p>
            <p className="font-medium">{new Date(subscriber.createdAt).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">Updated At</p>
            <p className="font-medium">{new Date(subscriber.updatedAt).toLocaleString()}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5 text-muted-foreground" />
            Status History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {historyLoading ? (
            <div className="animate-pulse space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-muted rounded" />
              ))}
            </div>
          ) : historyData?.data?.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">No status history available</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Previous Status</TableHead>
                  <TableHead>New Status</TableHead>
                  <TableHead>Changed By</TableHead>
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {historyData!.data.map((entry: SubscriberStatusHistoryEntry) => (
                  <TableRow key={entry.id}>
                    <TableCell>{new Date(entry.createdAt).toLocaleString()}</TableCell>
                    <TableCell>
                      {entry.oldStatus ? (
                        <Badge variant={statusBadgeVariant[entry.oldStatus]}>{entry.oldStatus}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariant[entry.newStatus]}>{entry.newStatus}</Badge>
                    </TableCell>
                    <TableCell>{entry.changedBy ?? "System"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{entry.note ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}